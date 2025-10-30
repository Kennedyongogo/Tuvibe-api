const { Payment } = require("../models");
const { addTokens } = require("../services/tokenService");

exports.list = async (req, res) => {
  try {
    const rows = await Payment.findAll({
      where: { public_user_id: req.publicUserId },
      order: [["createdAt", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("payments list error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list payments" });
  }
};

exports.create = async (req, res) => {
  try {
    const { amount, method, transaction_id } = req.body;
    if (!amount || !method)
      return res
        .status(400)
        .json({ success: false, message: "amount and method required" });
    const row = await Payment.create({
      public_user_id: req.publicUserId,
      amount,
      method,
      transaction_id,
      status: "completed",
    });
    // credit tokens 1:1 per TCD
    await addTokens(req.publicUserId, Number(amount), {
      payment_method: method,
      reference: transaction_id,
      description: "Payment top-up",
    });
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error("payments create error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create payment" });
  }
};
