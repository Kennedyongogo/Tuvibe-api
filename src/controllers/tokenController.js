const { Op } = require("sequelize");
const { TokenTransaction, PublicUser, ProfileBoost } = require("../models");
const { addTokens, deductTokens } = require("../services/tokenService");
const {
  BOOST_DURATION_HOURS,
  BOOST_PRICE_TOKENS,
  BOOST_PRICE_KSH,
} = require("../config/pricing");
const {
  normalizeCountyName,
  KENYA_COUNTIES,
} = require("../config/kenyaCounties");

const ALLOWED_BOOST_CATEGORIES = [
  "Regular",
  "Sugar Mummy",
  "Sponsor",
  "Ben 10",
];

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
    return res.status(201).json({ success: true, data: { balance } });
  } catch (err) {
    console.error("purchaseTokens error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to purchase tokens" });
  }
};

// Profile boost purchase: deduct tokens and create a targeted ProfileBoost record
exports.boostProfile = async (req, res) => {
  try {
    const { targetCategory, targetArea } = req.body;

    if (!targetCategory || !ALLOWED_BOOST_CATEGORIES.includes(targetCategory)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing target category",
      });
    }

    const normalizedTargetCounty = normalizeCountyName(targetArea);
    if (!normalizedTargetCounty) {
      return res.status(400).json({
        success: false,
        message: "Target county must be one of the 47 counties of Kenya",
        data: { counties: KENYA_COUNTIES },
      });
    }

    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

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

    const activeBoost = await ProfileBoost.findOne({
      where: {
        public_user_id: user.id,
        status: "active",
        ends_at: { [Op.gt]: now },
      },
      order: [["ends_at", "DESC"]],
    });

    await deductTokens(
      req.publicUserId,
      BOOST_PRICE_TOKENS,
      `Profile boost for ${BOOST_DURATION_HOURS}h`
    );

    const baseline = activeBoost ? new Date(activeBoost.ends_at) : now;
    const until = new Date(
      baseline.getTime() + BOOST_DURATION_HOURS * 3600 * 1000
    );

    if (activeBoost) {
      await activeBoost.update({ status: "expired" });
    }

    const boostRecord = await ProfileBoost.create({
      public_user_id: user.id,
      target_category: targetCategory,
      target_area: normalizedTargetCounty,
      price_kes: BOOST_PRICE_KSH,
      starts_at: now,
      ends_at: until,
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
        costTokens: BOOST_PRICE_TOKENS,
        costKsh: BOOST_PRICE_KSH,
        targetCounty: normalizedTargetCounty,
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
