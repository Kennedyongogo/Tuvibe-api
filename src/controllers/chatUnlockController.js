const { PublicUser, ChatUnlock } = require("../models");
const { deductTokens } = require("../services/tokenService");
const { Op } = require("sequelize");

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

    const premiumCategories = ["Sugar Mummy", "Sponsor", "Ben 10"];
    const isRequesterRegular = requester.category === "Regular";
    const isRequesterPremium = premiumCategories.includes(requester.category);
    const isTargetPremium = premiumCategories.includes(target.category);

    // Check if regular user is trying to unlock premium user
    if (isRequesterRegular && isTargetPremium) {
      return res.status(403).json({
        success: false,
        message:
          "Please upgrade to premium to unlock chat with premium users. Choose a premium category to upgrade.",
        requiresUpgrade: true,
      });
    }

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

    const cost = CATEGORY_COST[target.category] ?? 10;
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

    // Check if regular user is trying to unlock premium user
    const premiumCategories = ["Sugar Mummy", "Sponsor", "Ben 10"];
    const isRequesterRegular = requester.category === "Regular";
    const isRequesterPremium = premiumCategories.includes(requester.category);
    const isTargetPremium = premiumCategories.includes(target.category);

    if (isRequesterRegular && isTargetPremium) {
      // Record failed attempt
      await ChatUnlock.create({
        public_user_id: req.publicUserId,
        target_user_id,
        token_cost: 0,
        status: "failed",
      });

      return res.status(403).json({
        success: false,
        message:
          "Please upgrade to premium to unlock chat with premium users. Choose a premium category to upgrade.",
        requiresUpgrade: true,
      });
    }

    // Check if premium user is trying to unlock another premium user
    // Premium users can only unlock premium users if target is verified (from Premium Lounge)
    // Unverified premium users in explore cannot be unlocked by premium users
    if (isRequesterPremium && isTargetPremium) {
      // Allow if target is verified (they're from Premium Lounge)
      if (!target.isVerified) {
        // Record failed attempt
        await ChatUnlock.create({
          public_user_id: req.publicUserId,
          target_user_id,
          token_cost: 0,
          status: "failed",
        });

        return res.status(403).json({
          success: false,
          message:
            "Premium users cannot unlock unverified premium users from explore. Please proceed to Premium Lounge to unlock verified premium users.",
          requiresPremiumLounge: true,
        });
      }
      // If target is verified, allow the unlock (they're from Premium Lounge)
    }

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
            "photo",
            "category",
            "age",
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
    return res.json({ success: true, data: rows });
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
