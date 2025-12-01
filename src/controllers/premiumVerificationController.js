const { PublicUser } = require("../models");
const { Op, Sequelize } = require("sequelize");
const { deductTokens } = require("../services/tokenService");
const {
  PREMIUM_CATEGORIES,
  PREMIUM_UPGRADE_PRICE_TOKENS,
  PREMIUM_UPGRADE_PRICE_KSH,
} = require("../config/pricing");
const { formatUserForPublicResponse } = require("../utils/userProfile");

const activeBoostUntilSubquery = `(
  SELECT pb.ends_at
  FROM profile_boosts pb
  WHERE pb.public_user_id = "PublicUser"."id"
    AND pb.status = 'active'
    AND pb.ends_at > NOW()
  ORDER BY pb.ends_at DESC
  LIMIT 1
)`;

const activeBoostPresenceOrderLiteral = Sequelize.literal(
  `CASE WHEN ${activeBoostUntilSubquery} IS NULL THEN 0 ELSE 1 END`
);
const activeBoostUntilOrderLiteral = Sequelize.literal(
  `COALESCE(${activeBoostUntilSubquery}, '1970-01-01'::timestamp)`
);

// Upgrade from Regular to Premium category - DISABLED
// Users now select their category during registration
// This endpoint is kept for backward compatibility but returns an error
exports.upgradeToPremium = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Category upgrade is no longer available. Please select your category during registration. If you need to change your category, please contact support.",
  });
};

// Get upgrade costs for premium categories - DISABLED
// Category upgrade is no longer available
exports.getUpgradeCosts = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Category upgrade is no longer available. Please select your category during registration.",
    data: { categories: [] },
  });
};

// Premium Lounge listings by category with cost metadata
exports.loungeByCategory = async (req, res) => {
  try {
    const { category } = req.params; // "Sugar Mummy" | "Sponsor" | "Ben 10" | "Urban Chics"
    if (!PREMIUM_CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid category" });
    }
    // Guests are not allowed to view premium lounge
    if (!req.publicUserId) {
      return res
        .status(401)
        .json({ success: false, message: "Login required" });
    }

    // Get current user to check if they are premium
    const currentUser = await PublicUser.findByPk(req.publicUserId, {
      attributes: ["category"],
    });

    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isCurrentUserPremium = PREMIUM_CATEGORIES.includes(
      currentUser.category
    );

    // Only premium users (verified or unverified) can access Premium Lounge
    if (!isCurrentUserPremium) {
      return res.status(403).json({
        success: false,
        message:
          "Please upgrade to premium to access Premium Lounge. Choose a premium category to upgrade.",
        requiresUpgrade: true,
      });
    }

    // Premium Lounge shows verified premium users only
    const rows = await PublicUser.findAll({
      where: {
        category,
        isVerified: true,
        id: { [Op.ne]: req.publicUserId },
      },
      attributes: {
        exclude: ["password", "otp", "phone"],
        include: [
          [Sequelize.literal(activeBoostUntilSubquery), "active_boost_until"],
        ],
      },
      order: [
        [activeBoostPresenceOrderLiteral, "DESC"],
        [activeBoostUntilOrderLiteral, "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: 50,
    });
    // Token cost metadata (aligned with chat unlock controller)
    const costMap = {
      Regular: 5,
      "Sugar Mummy": 20,
      Sponsor: 20,
      "Ben 10": 10,
      "Urban Chics": 20,
    };
    const sanitizedUsers = rows.map((user) => {
      const data = formatUserForPublicResponse(user);

      if (data.photo_moderation_status !== "approved") {
        data.photo = null;
      }

      if (Array.isArray(data.photos)) {
        data.photos = data.photos.filter(
          (photo) => photo?.moderation_status === "approved"
        );
      }

      return data;
    });

    return res.json({
      success: true,
      data: { cost: costMap[category] ?? 10, users: sanitizedUsers },
    });
  } catch (err) {
    console.error("loungeByCategory error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch premium lounge" });
  }
};
