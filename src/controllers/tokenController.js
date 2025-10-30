const { TokenTransaction } = require("../models");
const { addTokens } = require("../services/tokenService");

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
