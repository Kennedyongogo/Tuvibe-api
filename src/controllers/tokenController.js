const { Op } = require("sequelize");
const { TokenTransaction, PublicUser, ProfileBoost } = require("../models");
const { addTokens, deductTokens } = require("../services/tokenService");
const { sendEventToUser } = require("../routes/sseRoutes");
const { formatUserForResponse } = require("../utils/userProfile");
const {
  BOOST_DURATION_HOURS,
  BOOST_PRICE_TOKENS,
  BOOST_PRICE_KSH,
} = require("../config/pricing");
const {
  useBoostForRegular,
  REGULAR_PLANS,
  getActiveSubscriptionForUser,
} = require("../services/subscriptionService");
const { normalizeCountyName } = require("../config/kenyaCounties");

const ALLOWED_BOOST_CATEGORIES = [
  "Regular",
  "Sugar Mummy",
  "Sponsor",
  "Ben 10",
  "Urban Chics",
];

const BASE_BOOST_DURATION_HOURS = Number(BOOST_DURATION_HOURS) || 1;
const BASE_BOOST_PRICE_TOKENS = Number(BOOST_PRICE_TOKENS) || 0;
const BASE_BOOST_PRICE_KSH = Number(BOOST_PRICE_KSH) || 0;

exports.getBalance = async (req, res) => {
  try {
    const freshUser = await PublicUser.findByPk(req.publicUserId, {
      attributes: ["token_balance"],
    });

    if (!freshUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const balanceValue = Number(freshUser.token_balance || 0);

    return res.json({
      success: true,
      data: { balance: balanceValue },
    });
  } catch (err) {
    console.error("getBalance error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch balance" });
  }
};

exports.listTransactions = async (req, res) => {
  try {
    const rows = await TokenTransaction.findAll({
      where: { public_user_id: req.publicUserId },
      order: [["createdAt", "DESC"]],
      limit: 100,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("listTransactions error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch transactions" });
  }
};

exports.getTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await TokenTransaction.findByPk(id);
    if (!row)
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    // Verify transaction belongs to current user
    if (row.public_user_id !== req.publicUserId)
      return res.status(403).json({ success: false, message: "Access denied" });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error("getTransaction error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch transaction" });
  }
};

exports.purchaseTokens = async (req, res) => {
  try {
    const { amount, method, reference } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Amount required" });
    }
    const balance = await addTokens(req.publicUserId, Number(amount), {
      payment_method: method || "system",
      reference: reference || null,
      description: "Token top-up",
    });

    // Send SSE event for user update (token balance changed)
    try {
      const updatedUser = await PublicUser.findByPk(req.publicUserId, {
        attributes: { exclude: ["password", "otp"] },
      });
      if (updatedUser) {
        sendEventToUser(
          req.publicUserId,
          "user:update",
          formatUserForResponse(updatedUser)
        );
      }
    } catch (sseError) {
      console.error("[SSE] Error sending user:update event:", sseError);
    }

    return res.status(201).json({ success: true, data: { balance } });
  } catch (err) {
    console.error("purchaseTokens error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to purchase tokens" });
  }
};

// Profile boost purchase: deduct tokens and create a targeted ProfileBoost record
const parseCoordinate = (value) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const sanitizeRadius = (value, { min = 1, max = 200, fallback = 10 } = {}) => {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.max(numeric, min), max);
};

exports.boostProfile = async (req, res) => {
  try {
    const {
      targetCategory,
      targetArea,
      targetLatitude,
      targetLongitude,
      targetRadiusKm,
      targetLat,
      targetLng,
      targetRadius,
      durationHours,
      hours,
      purchaseHours,
    } = req.body;

    if (!targetCategory || !ALLOWED_BOOST_CATEGORIES.includes(targetCategory)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing target category",
      });
    }

    const boostLat =
      parseCoordinate(targetLatitude) ?? parseCoordinate(targetLat);
    const boostLng =
      parseCoordinate(targetLongitude) ?? parseCoordinate(targetLng);
    const boostRadiusKm = sanitizeRadius(targetRadiusKm ?? targetRadius, {
      min: 1,
      max: 200,
      fallback: 10,
    });

    if (
      boostLat === null ||
      boostLng === null ||
      boostLat < -90 ||
      boostLat > 90 ||
      boostLng < -180 ||
      boostLng > 180
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid target latitude and longitude are required to geotarget a boost.",
      });
    }

    const normalizedTargetCounty = targetArea
      ? normalizeCountyName(targetArea) || targetArea?.trim() || null
      : null;

    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const requestedBlocks = Number.parseInt(
      durationHours ?? hours ?? purchaseHours ?? 1,
      10
    );
    const purchasedBlocks =
      Number.isFinite(requestedBlocks) && requestedBlocks > 0
        ? Math.min(requestedBlocks, 24)
        : 1;
    const totalHoursPurchased = purchasedBlocks * BASE_BOOST_DURATION_HOURS;
    const extensionMs = totalHoursPurchased * 3600 * 1000;

    const now = new Date();

    await ProfileBoost.update(
      { status: "expired" },
      {
        where: {
          public_user_id: user.id,
          status: "active",
          ends_at: { [Op.lte]: now },
        },
      }
    );

    // Regular users: subscription-based boost allowance
    let tokenCost = 0;
    let cashCost = 0;

    if (user.category === "Regular") {
      const usage = await useBoostForRegular(req.publicUserId);

      if (!usage.subscription) {
        return res.status(402).json({
          success: false,
          message: "Active subscription required to boost your profile.",
        });
      }

      if (!usage.allowed) {
        return res.status(429).json({
          success: false,
          message: "Daily profile boost limit reached for your plan.",
        });
      }

      // For Gold, we standardize boosts to 2-hour blocks as per plan
      const subscription = await getActiveSubscriptionForUser(req.publicUserId);
      const plan = subscription ? REGULAR_PLANS[subscription.plan] : null;

      if (plan && subscription.plan === "Gold") {
        // Override duration for Gold boosts: 2 hours fixed
        const goldHours = 2;
        const goldExtensionMs = goldHours * 3600 * 1000;
        // Replace extension with fixed Gold duration
        const newEndsAt = new Date(now.getTime() + goldExtensionMs);
        // We'll use this below when creating the record
        // Adjust extensionMs and totalHoursPurchased for response purposes
        extensionMs = goldExtensionMs;
      }
    } else {
      // Non-regular (premium) users: keep existing token-based behaviour
      tokenCost = BASE_BOOST_PRICE_TOKENS * purchasedBlocks;
      cashCost = BASE_BOOST_PRICE_KSH * purchasedBlocks;

      await deductTokens(
        req.publicUserId,
        tokenCost,
        `Profile boost (${totalHoursPurchased}h)`
      );

      // Send SSE event for user update (token balance changed)
      try {
        const updatedUser = await PublicUser.findByPk(req.publicUserId, {
          attributes: { exclude: ["password", "otp"] },
        });
        if (updatedUser) {
          sendEventToUser(
            req.publicUserId,
            "user:update",
            formatUserForResponse(updatedUser)
          );
        }
      } catch (sseError) {
        console.error("[SSE] Error sending user:update event:", sseError);
      }
    }

    const boostRecord = await ProfileBoost.create({
      public_user_id: user.id,
      target_category: targetCategory,
      target_area: normalizedTargetCounty,
      target_lat: boostLat,
      target_lng: boostLng,
      target_radius_km: boostRadiusKm,
      price_kes: cashCost,
      starts_at: now,
      ends_at: new Date(now.getTime() + extensionMs),
      status: "active",
    });

    const totalBoosts = await ProfileBoost.count({
      where: { public_user_id: user.id },
    });

    console.log("[Boost] Created new boost", {
      userId: user.id,
      targetArea: normalizedTargetCounty,
      purchasedBlocks,
      totalHoursPurchased,
    });

    return res.json({
      success: true,
      data: {
        boost: boostRecord,
        totalBoosts,
        costTokens: tokenCost,
        costKsh: cashCost,
        hoursPurchased: totalHoursPurchased,
        targetCounty: normalizedTargetCounty,
        targetLatitude: boostLat,
        targetLongitude: boostLng,
        targetRadiusKm: boostRadiusKm,
      },
    });
  } catch (err) {
    if (err.code === "INSUFFICIENT_TOKENS") {
      return res
        .status(402)
        .json({ success: false, message: "Insufficient tokens" });
    }
    console.error("boostProfile error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to boost profile" });
  }
};

exports.extendProfileBoost = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      additionalHours,
      hours,
      durationHours,
      targetRadiusKm,
      targetRadius,
    } = req.body;

    const now = new Date();

    const boost = await ProfileBoost.findOne({
      where: {
        id,
        public_user_id: req.publicUserId,
        status: "active",
        ends_at: { [Op.gt]: now },
      },
    });

    if (!boost) {
      return res.status(404).json({
        success: false,
        message: "Active boost not found for this user",
      });
    }

    const requestedBlocks = Number.parseInt(
      additionalHours ?? hours ?? durationHours ?? 1,
      10
    );
    const purchasedBlocks =
      Number.isFinite(requestedBlocks) && requestedBlocks > 0
        ? Math.min(requestedBlocks, 24)
        : 1;
    const totalHoursPurchased = purchasedBlocks * BASE_BOOST_DURATION_HOURS;
    const extensionMs = totalHoursPurchased * 3600 * 1000;

    const tokenCost = BASE_BOOST_PRICE_TOKENS * purchasedBlocks;
    const cashCost = BASE_BOOST_PRICE_KSH * purchasedBlocks;

    await deductTokens(
      req.publicUserId,
      tokenCost,
      `Extend profile boost (${totalHoursPurchased}h)`
    );

    // Send SSE event for user update (token balance changed)
    try {
      const updatedUser = await PublicUser.findByPk(req.publicUserId, {
        attributes: { exclude: ["password", "otp"] },
      });
      if (updatedUser) {
        sendEventToUser(
          req.publicUserId,
          "user:update",
          formatUserForResponse(updatedUser)
        );
      }
    } catch (sseError) {
      console.error("[SSE] Error sending user:update event:", sseError);
    }

    const radiusFallback =
      boost.target_radius_km !== null
        ? Number.parseFloat(boost.target_radius_km)
        : 10;
    const updatedRadius = sanitizeRadius(
      targetRadiusKm ?? targetRadius ?? radiusFallback,
      {
        fallback: radiusFallback,
      }
    );

    const currentEndsAt = new Date(boost.ends_at);
    const baseline = currentEndsAt > now ? currentEndsAt : now;
    const newEndsAt = new Date(baseline.getTime() + extensionMs);

    boost.target_radius_km = updatedRadius;
    boost.ends_at = newEndsAt;
    await boost.save();

    console.log("[Boost] Extended boost", {
      userId: req.publicUserId,
      boostId: id,
      purchasedBlocks,
      totalHoursPurchased,
      updatedRadius,
    });

    return res.json({
      success: true,
      data: {
        boost,
        costTokens: tokenCost,
        costKsh: cashCost,
        hoursExtended: totalHoursPurchased,
        endsAt: newEndsAt,
      },
    });
  } catch (err) {
    if (err.code === "INSUFFICIENT_TOKENS") {
      return res
        .status(402)
        .json({ success: false, message: "Insufficient tokens" });
    }
    console.error("extendProfileBoost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to extend boost",
    });
  }
};
