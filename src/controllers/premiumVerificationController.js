const { PublicUser } = require("../models");
const { Op, Sequelize } = require("sequelize");
const { deductTokens } = require("../services/tokenService");
const {
  PREMIUM_CATEGORIES,
  PREMIUM_UPGRADE_PRICE_TOKENS,
  PREMIUM_UPGRADE_PRICE_KSH,
} = require("../config/pricing");

const activeBoostUntilSubquery = `(
  SELECT pb.ends_at
  FROM profile_boosts pb
  WHERE pb.public_user_id = "PublicUser"."id"
    AND pb.status = 'active'
    AND pb.ends_at > NOW()
  ORDER BY pb.ends_at DESC
  LIMIT 1
)`;

const activeBoostPresenceOrderLiteral = Sequelize.literal(`CASE WHEN ${activeBoostUntilSubquery} IS NULL THEN 0 ELSE 1 END`);
const activeBoostUntilOrderLiteral = Sequelize.literal(`COALESCE(${activeBoostUntilSubquery}, '1970-01-01'::timestamp)`);

// Upgrade from Regular to Premium category - charges tokens and automatically verifies
exports.upgradeToPremium = async (req, res) => {
  try {
    const { category } = req.body;

    if (!category || !PREMIUM_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid category. Must be one of: Sugar Mummy, Sponsor, Ben 10",
      });
    }

    // Get current user
    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check if user is already in a premium category
    if (PREMIUM_CATEGORIES.includes(user.category)) {
      return res.status(400).json({
        success: false,
        message: "User is already in a premium category",
      });
    }

    // Check if user is Regular
    if (user.category !== "Regular") {
      return res.status(400).json({
        success: false,
        message: "Only Regular users can upgrade to premium",
      });
    }

    const cost = PREMIUM_UPGRADE_PRICE_TOKENS;

    // Check token balance and deduct tokens
    try {
      await deductTokens(
        req.publicUserId,
        cost,
        `Upgrade to ${category} category`
      );
    } catch (tokenError) {
      if (tokenError.code === "INSUFFICIENT_TOKENS") {
        return res.status(402).json({
          success: false,
          message: "Insufficient tokens",
        });
      }
      throw tokenError;
    }

    // Update user category and verify
    user.category = category;
    user.isVerified = true;
    await user.save();

    const updatedUser = await PublicUser.findByPk(req.publicUserId, {
      attributes: { exclude: ["password", "otp"] },
    });

    return res.json({
      success: true,
      message: `Successfully upgraded to ${category}`,
      data: {
        user: updatedUser,
        cost,
        costKsh: PREMIUM_UPGRADE_PRICE_KSH,
        remainingBalance: updatedUser.token_balance,
      },
    });
  } catch (err) {
    console.error("upgradeToPremium error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to upgrade to premium" });
  }
};

// Get upgrade costs for premium categories
exports.getUpgradeCosts = async (req, res) => {
  try {
    const categories = PREMIUM_CATEGORIES.map((category) => ({
      category,
      costTokens: PREMIUM_UPGRADE_PRICE_TOKENS,
      costKsh: PREMIUM_UPGRADE_PRICE_KSH,
      description: `Upgrade to ${category} for exclusive connections`,
    }));

    return res.json({
      success: true,
      data: { categories },
    });
  } catch (err) {
    console.error("getUpgradeCosts error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch upgrade costs" });
  }
};

// Premium Lounge listings by category with cost metadata
exports.loungeByCategory = async (req, res) => {
  try {
    const { category } = req.params; // "Sugar Mummy" | "Sponsor" | "Ben 10"
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
    };
    return res.json({
      success: true,
      data: { cost: costMap[category] ?? 10, users: rows },
    });
  } catch (err) {
    console.error("loungeByCategory error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch premium lounge" });
  }
};
