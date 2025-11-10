const { PublicUser, ChatUnlock } = require("../models");
const { deductTokens } = require("../services/tokenService");
const { Op } = require("sequelize");
const { formatUserForPublicResponse } = require("../utils/userProfile");
const {
  PREMIUM_CATEGORIES,
  CHAT_COST_RULES_TOKENS,
} = require("../config/pricing");

const isPremiumCategory = (category) => PREMIUM_CATEGORIES.includes(category);

const getChatCostTokens = (requesterCategory, targetCategory) => {
  const requesterPremium = isPremiumCategory(requesterCategory);
  const targetPremium = isPremiumCategory(targetCategory);

  if (!requesterPremium && !targetPremium) {
    return CHAT_COST_RULES_TOKENS.normalToNormal;
  }

  if (!requesterPremium && targetPremium) {
    return CHAT_COST_RULES_TOKENS.normalToPremium;
  }

  if (requesterPremium && !targetPremium) {
    return CHAT_COST_RULES_TOKENS.premiumToNormal;
  }

  return CHAT_COST_RULES_TOKENS.premiumToPremium;
};

exports.getChatCost = async (req, res) => {
  try {
    const { target_user_id } = req.query;
    const target = await PublicUser.findByPk(target_user_id);
    if (!target)
      return res
        .status(404)
        .json({ success: false, message: "Target user not found" });

    // Get requester user
    const requester = await PublicUser.findByPk(req.publicUserId);
    if (!requester) {
      return res
        .status(404)
        .json({ success: false, message: "Requester user not found" });
    }

    // Check if chat is already unlocked - if yes, cost is 0
    const existingUnlock = await ChatUnlock.findOne({
      where: {
        public_user_id: req.publicUserId,
        target_user_id,
        status: "success",
      },
    });

    if (existingUnlock) {
      // Already unlocked - no cost
      return res.json({
        success: true,
        data: { cost: 0, alreadyUnlocked: true },
      });
    }

    const premiumCategories = PREMIUM_CATEGORIES;
    const isRequesterPremium = premiumCategories.includes(requester.category);
    const isTargetPremium = premiumCategories.includes(target.category);

    // Check if premium user is trying to unlock another premium user
    // Premium users can only unlock premium users if target is verified (from Premium Lounge)
    // Unverified premium users in explore cannot be unlocked by premium users
    if (isRequesterPremium && isTargetPremium) {
      // Allow if target is verified (they're from Premium Lounge)
      if (!target.isVerified) {
        return res.status(403).json({
          success: false,
          message:
            "Premium users cannot unlock unverified premium users from explore. Please proceed to Premium Lounge to unlock verified premium users.",
          requiresPremiumLounge: true,
        });
      }
      // If target is verified, allow the unlock (they're from Premium Lounge)
    }

    const cost = getChatCostTokens(requester.category, target.category);
    return res.json({ success: true, data: { cost, alreadyUnlocked: false } });
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

    // Get requester user
    const requester = await PublicUser.findByPk(req.publicUserId);
    if (!requester) {
      return res
        .status(404)
        .json({ success: false, message: "Requester user not found" });
    }

    const target = await PublicUser.findByPk(target_user_id);
    if (!target)
      return res
        .status(404)
        .json({ success: false, message: "Target user not found" });

    // Check if chat is already unlocked - if yes, return phone number without charging
    const existingUnlock = await ChatUnlock.findOne({
      where: {
        public_user_id: req.publicUserId,
        target_user_id,
        status: "success",
      },
    });

    if (existingUnlock) {
      // Already unlocked - return phone number without charging again
      const phone = (target.phone || "").replace(/[^\d+]/g, "");
      const wa = `https://wa.me/${phone.replace(/^\+/, "")}`;
      return res.json({
        success: true,
        data: {
          phone: target.phone,
          whatsapp_link: wa,
          alreadyUnlocked: true, // Flag to indicate it was already unlocked
        },
      });
    }

    const premiumCategories = PREMIUM_CATEGORIES;
    const isRequesterPremium = premiumCategories.includes(requester.category);
    const isTargetPremium = premiumCategories.includes(target.category);

    if (isRequesterPremium && isTargetPremium) {
      // Allow if target is verified (they're from Premium Lounge)
      if (!target.isVerified) {
        return res.status(403).json({
          success: false,
          message:
            "Premium users cannot unlock unverified premium users from explore. Please proceed to Premium Lounge to unlock verified premium users.",
          requiresPremiumLounge: true,
        });
      }
      // If target is verified, allow the unlock (they're from Premium Lounge)
    }

    const cost = getChatCostTokens(requester.category, target.category);
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
      const phone = (target.phone || "").replace(/[^\d+]/g, "");
      const wa = `https://wa.me/${phone.replace(/^\+/, "")}`;
      return res.json({
        success: true,
        data: { phone: target.phone, whatsapp_link: wa },
      });
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

// List all successfully unlocked chats for the current user
exports.list = async (req, res) => {
  try {
    const rows = await ChatUnlock.findAll({
      where: {
        public_user_id: req.publicUserId,
        status: "success", // Only show successful unlocks
      },
      include: [
        {
          model: PublicUser,
          as: "target",
          attributes: [
            "id",
            "name",
            "username",
            "photo",
            "category",
            "age",
            "birth_year",
            "gender",
            "bio",
            "county",
            "phone",
            "isVerified",
            "is_online",
            "last_seen_at",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    const formattedRows = rows.map((row) => {
      const data = row.toJSON();
      if (data.target) {
        data.target = formatUserForPublicResponse(data.target);
      }
      return data;
    });
    return res.json({ success: true, data: formattedRows });
  } catch (err) {
    console.error("chat unlocks list error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list unlocked chats" });
  }
};

// Check if a specific user's chat is unlocked
exports.checkUnlocked = async (req, res) => {
  try {
    const { target_user_id } = req.query;
    if (!target_user_id)
      return res
        .status(400)
        .json({ success: false, message: "target_user_id required" });

    const unlock = await ChatUnlock.findOne({
      where: {
        public_user_id: req.publicUserId,
        target_user_id,
        status: "success",
      },
    });

    return res.json({
      success: true,
      data: { isUnlocked: !!unlock, unlock },
    });
  } catch (err) {
    console.error("check unlocked error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to check unlock status" });
  }
};
