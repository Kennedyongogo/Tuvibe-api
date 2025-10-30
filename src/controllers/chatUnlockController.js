const { PublicUser, ChatUnlock } = require("../models");
const { deductTokens } = require("../services/tokenService");

const CATEGORY_COST = {
  Regular: 5,
  "Sugar Mummy": 20,
  Sponsor: 20,
  "Ben 10": 10,
};

exports.getChatCost = async (req, res) => {
  try {
    const { target_user_id } = req.query;
    const target = await PublicUser.findByPk(target_user_id);
    if (!target)
      return res
        .status(404)
        .json({ success: false, message: "Target user not found" });
    const cost = CATEGORY_COST[target.category] ?? 10;
    return res.json({ success: true, data: { cost } });
  } catch (err) {
    console.error("getChatCost error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to compute cost" });
  }
};

exports.unlock = async (req, res) => {
  try {
    const { target_user_id } = req.body;
    if (!target_user_id)
      return res
        .status(400)
        .json({ success: false, message: "target_user_id required" });
    const target = await PublicUser.findByPk(target_user_id);
    if (!target)
      return res
        .status(404)
        .json({ success: false, message: "Target user not found" });
    const cost = CATEGORY_COST[target.category] ?? 10;
    try {
      await deductTokens(
        req.publicUserId,
        cost,
        `WhatsApp unlock: ${target.name}`
      );
      await ChatUnlock.create({
        public_user_id: req.publicUserId,
        target_user_id,
        token_cost: cost,
        status: "success",
      });
      return res.json({ success: true, data: { whatsapp: target.phone } });
    } catch (err) {
      await ChatUnlock.create({
        public_user_id: req.publicUserId,
        target_user_id,
        token_cost: cost,
        status: "failed",
      });
      if (err.code === "INSUFFICIENT_TOKENS") {
        return res
          .status(402)
          .json({ success: false, message: "Insufficient tokens" });
      }
      throw err;
    }
  } catch (err) {
    console.error("unlock error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to unlock chat" });
  }
};
