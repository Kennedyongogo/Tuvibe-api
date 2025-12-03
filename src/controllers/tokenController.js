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
  useBoostHoursForRegular,
  useBoostHoursForPremium,
  REGULAR_PLANS,
  PREMIUM_PLANS,
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

    // Regular and Premium users: subscription-based boost allowance (no tokens)
    let tokenCost = 0;
    let cashCost = 0;
    let extensionMs = 0;
    let totalHoursPurchased = 0;

    const PREMIUM_CATEGORIES = [
      "Sugar Mummy",
      "Sponsor",
      "Ben 10",
      "Urban Chics",
    ];
    const isPremium = PREMIUM_CATEGORIES.includes(user.category);

    if (user.category === "Regular") {
      const subscription = await getActiveSubscriptionForUser(req.publicUserId);
      const plan = subscription ? REGULAR_PLANS[subscription.plan] : null;

      if (!subscription || !plan) {
        return res.status(402).json({
          success: false,
          message: "Active subscription required to boost your profile.",
        });
      }

      if (subscription.plan === "Gold") {
        // Gold plan: use hours-based tracking
        // Use requested durationHours or plan's default (2 hours)
        const requestedHours = Number.parseFloat(
          durationHours ?? hours ?? purchaseHours
        );
        const usage = await useBoostHoursForRegular(
          req.publicUserId,
          Number.isFinite(requestedHours) && requestedHours > 0
            ? requestedHours
            : null // null will use plan's default
        );

        if (!usage.allowed) {
          return res.status(429).json({
            success: false,
            message: `Daily profile boost hours limit reached. You have ${usage.remaining.toFixed(
              1
            )} hours remaining.`,
          });
        }

        extensionMs = usage.consumedHours * 3600 * 1000;
        totalHoursPurchased = usage.consumedHours;
        cashCost = 0; // Free for Gold subscribers
      } else {
        // Silver plan doesn't have boosts
        return res.status(403).json({
          success: false,
          message:
            "Profile boosts are not available for your subscription plan.",
        });
      }
    } else if (isPremium) {
      // Premium category users: subscription-based boost allowance using hours
      const subscription = await getActiveSubscriptionForUser(req.publicUserId);
      const plan = subscription ? PREMIUM_PLANS[subscription.plan] : null;

      if (!subscription || !plan) {
        return res.status(402).json({
          success: false,
          message: "Active subscription required to boost your profile.",
        });
      }

      if (subscription.plan === "Silver") {
        // Silver plan: default 1-hour duration, can target one category
        const requestedHours = Number.parseFloat(
          durationHours ?? hours ?? purchaseHours
        );
        const usage = await useBoostHoursForPremium(
          req.publicUserId,
          Number.isFinite(requestedHours) && requestedHours > 0
            ? requestedHours
            : null // null will use plan's default
        );

        if (!usage.allowed) {
          return res.status(429).json({
            success: false,
            message: `Daily profile boost hours limit reached. You have ${usage.remaining.toFixed(
              1
            )} hours remaining.`,
          });
        }

        // Silver can only target one category - verify targetCategory is provided
        if (!targetCategory) {
          return res.status(400).json({
            success: false,
            message: "Target category is required for Silver plan boosts.",
          });
        }

        extensionMs = usage.consumedHours * 3600 * 1000;
        totalHoursPurchased = usage.consumedHours;
        cashCost = 0; // Free for Silver subscribers
      } else if (subscription.plan === "Gold") {
        // Gold plan: default 3-hour duration, can target all categories
        const requestedHours = Number.parseFloat(
          durationHours ?? hours ?? purchaseHours
        );
        const usage = await useBoostHoursForPremium(
          req.publicUserId,
          Number.isFinite(requestedHours) && requestedHours > 0
            ? requestedHours
            : null // null will use plan's default
        );

        if (!usage.allowed) {
          return res.status(429).json({
            success: false,
            message: `Daily profile boost hours limit reached. You have ${usage.remaining.toFixed(
              1
            )} hours remaining.`,
          });
        }

        extensionMs = usage.consumedHours * 3600 * 1000;
        totalHoursPurchased = usage.consumedHours;
        cashCost = 0; // Free for Gold subscribers
      } else {
        return res.status(403).json({
          success: false,
          message:
            "Profile boosts are not available for your subscription plan.",
        });
      }
    } else {
      // No token fallback - subscription required for all users
      return res.status(402).json({
        success: false,
        message:
          "Active subscription required to boost your profile. Please subscribe to a plan to continue.",
      });
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
    // Only handle INSUFFICIENT_TOKENS for premium users (not Regular)
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
    const user = await PublicUser.findByPk(req.publicUserId, {
      attributes: ["category"],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const PREMIUM_CATEGORIES = [
      "Sugar Mummy",
      "Sponsor",
      "Ben 10",
      "Urban Chics",
    ];
    const isRegularOrPremium =
      user.category === "Regular" || PREMIUM_CATEGORIES.includes(user.category);

    // For Regular and Premium users: allow extension using daily hours allowance
    if (isRegularOrPremium) {
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

      // Calculate requested extension hours
      const requestedHours = Number.parseFloat(
        additionalHours ?? hours ?? durationHours ?? 1
      );
      const extensionHours =
        Number.isFinite(requestedHours) && requestedHours > 0
          ? Math.min(requestedHours, 24) // Max 24 hours extension at once
          : 1;

      // Use hours-based allowance
      let usage;
      if (user.category === "Regular") {
        usage = await useBoostHoursForRegular(req.publicUserId, extensionHours);
      } else {
        usage = await useBoostHoursForPremium(req.publicUserId, extensionHours);
      }

      if (!usage.subscription) {
        return res.status(402).json({
          success: false,
          message: "Active subscription required to extend boost.",
        });
      }

      if (!usage.allowed) {
        return res.status(429).json({
          success: false,
          message: `Insufficient daily boost hours. You have ${usage.remaining.toFixed(
            1
          )} hours remaining, but need ${extensionHours} hours.`,
        });
      }

      // Update boost end time
      const extensionMs = usage.consumedHours * 3600 * 1000;
      const currentEndsAt = new Date(boost.ends_at);
      const baseline = currentEndsAt > now ? currentEndsAt : now;
      const newEndsAt = new Date(baseline.getTime() + extensionMs);

      // Update radius if provided
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

      boost.target_radius_km = updatedRadius;
      boost.ends_at = newEndsAt;
      await boost.save();

      return res.json({
        success: true,
        data: {
          boost,
          hoursExtended: usage.consumedHours,
          remainingHours: usage.remaining,
          endsAt: newEndsAt,
        },
      });
    }

    // For other users (if any), keep token-based extension as fallback
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

/**
 * Admin endpoint to boost fake profiles
 * Bypasses all subscription checks and allows admins to boost any user's profile
 */
exports.adminBoostFakeProfile = async (req, res) => {
  try {
    const {
      public_user_id,
      targetCategory,
      targetArea,
      targetLatitude,
      targetLongitude,
      targetRadiusKm,
      targetLat,
      targetLng,
      targetRadius,
      durationHours,
    } = req.body;

    // Validate required fields
    if (!public_user_id) {
      return res.status(400).json({
        success: false,
        message: "public_user_id is required",
      });
    }

    if (!targetCategory || !ALLOWED_BOOST_CATEGORIES.includes(targetCategory)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing target category",
      });
    }

    // Parse coordinates
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

    // Validate duration
    const hours = Number.parseFloat(durationHours) || 1;
    if (hours <= 0 || hours > 24) {
      return res.status(400).json({
        success: false,
        message: "Duration must be between 0.1 and 24 hours",
      });
    }

    const normalizedTargetCounty = targetArea
      ? normalizeCountyName(targetArea) || targetArea?.trim() || null
      : null;

    // Check if user exists
    const user = await PublicUser.findByPk(public_user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const now = new Date();

    // Expire any existing expired boosts
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

    // Calculate boost duration in milliseconds
    const extensionMs = hours * 3600 * 1000;

    // Create boost record (admin bypasses all subscription checks)
    const boostRecord = await ProfileBoost.create({
      public_user_id: user.id,
      target_category: targetCategory,
      target_area: normalizedTargetCounty,
      target_lat: boostLat,
      target_lng: boostLng,
      target_radius_km: boostRadiusKm,
      price_kes: 0, // Free for admin-created boosts
      starts_at: now,
      ends_at: new Date(now.getTime() + extensionMs),
      status: "active",
    });

    const totalBoosts = await ProfileBoost.count({
      where: { public_user_id: user.id },
    });

    return res.json({
      success: true,
      message: "Fake profile boost created successfully",
      data: {
        boost: boostRecord,
        totalBoosts,
        hoursPurchased: hours,
        targetCounty: normalizedTargetCounty,
        targetLatitude: boostLat,
        targetLongitude: boostLng,
        targetRadiusKm: boostRadiusKm,
      },
    });
  } catch (err) {
    console.error("adminBoostFakeProfile error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to boost fake profile",
      error: err.message,
    });
  }
};

/**
 * Admin endpoint to extend fake profile boosts
 * Bypasses all subscription checks and allows admins to extend any user's boost
 */
exports.adminExtendFakeBoost = async (req, res) => {
  try {
    const { id } = req.params;
    const { additionalHours, hours, durationHours } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Boost ID is required",
      });
    }

    // Calculate requested extension hours
    const requestedHours = Number.parseFloat(
      additionalHours ?? hours ?? durationHours ?? 1
    );
    const extensionHours =
      Number.isFinite(requestedHours) && requestedHours > 0
        ? Math.min(requestedHours, 24) // Max 24 hours extension at once
        : 1;

    const now = new Date();

    const boost = await ProfileBoost.findOne({
      where: {
        id,
        status: "active",
        ends_at: { [Op.gt]: now },
      },
    });

    if (!boost) {
      return res.status(404).json({
        success: false,
        message: "Active boost not found",
      });
    }

    // Update boost end time (admin bypasses all checks)
    const extensionMs = extensionHours * 3600 * 1000;
    const currentEndsAt = new Date(boost.ends_at);
    const baseline = currentEndsAt > now ? currentEndsAt : now;
    const newEndsAt = new Date(baseline.getTime() + extensionMs);

    await boost.update({
      ends_at: newEndsAt,
    });

    await boost.reload();

    return res.json({
      success: true,
      message: "Boost extended successfully",
      data: {
        boost: boost.toJSON(),
        extensionHours: extensionHours,
        newEndsAt: newEndsAt,
      },
    });
  } catch (err) {
    console.error("adminExtendFakeBoost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to extend boost",
      error: err.message,
    });
  }
};
