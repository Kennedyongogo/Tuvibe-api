const { TokenTransaction } = require("../models");
const { addTokens, deductTokens } = require("../services/tokenService");
const { PublicUser } = require("../models");

exports.getBalance = async (req, res) => {
  try {
    const { publicUser } = req;
    return res.json({
      success: true,
      data: { balance: publicUser.token_balance },
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
      return res
        .status(403)
        .json({ success: false, message: "Access denied" });
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

// Simple boost: deduct fixed tokens and bump boost_score for N hours
exports.boostProfile = async (req, res) => {
  try {
    const { hours = 24, cost = 20 } = req.body; // defaults
    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    await deductTokens(
      req.publicUserId,
      Number(cost),
      `Profile boost for ${hours}h`
    );
    const now = new Date();
    const until = new Date(
      Math.max(now.getTime(), new Date(user.is_featured_until || 0).getTime()) +
        Number(hours) * 3600 * 1000
    );
    const newBoost = (user.boost_score || 0) + 1;
    await user.update({ is_featured_until: until, boost_score: newBoost });
    return res.json({
      success: true,
      data: { is_featured_until: until, boost_score: newBoost },
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
