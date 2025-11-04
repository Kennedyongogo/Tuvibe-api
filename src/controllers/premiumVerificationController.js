const { PublicUser } = require("../models");
const { Op } = require("sequelize");
const { deductTokens } = require("../services/tokenService");

// Upgrade from Regular to Premium category - charges tokens and automatically verifies
exports.upgradeToPremium = async (req, res) => {
  try {
    const { category } = req.body;
    const premiumCategories = ["Sugar Mummy", "Sponsor", "Ben 10"];

    if (!category || !premiumCategories.includes(category)) {
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
    if (premiumCategories.includes(user.category)) {
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

    // Define token cost for upgrading to premium category
    const upgradeCostMap = {
      "Sugar Mummy": 50,
      Sponsor: 50,
      "Ben 10": 30,
    };
    const cost = upgradeCostMap[category] || 50;

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
          message: `Insufficient tokens. Required: ${cost} tokens`,
        });
      }
      throw tokenError;
    }

    // Update user category to premium and automatically verify
    // Payment of tokens serves as verification
    await user.update({
      category,
      isVerified: true, // Automatically verified upon upgrade
    });

    // Fetch updated user
    const updatedUser = await PublicUser.findByPk(req.publicUserId, {
      attributes: { exclude: ["password", "otp"] },
    });

    console.log(
      `User ${req.publicUserId} upgraded to ${category} category and automatically verified. Cost: ${cost} tokens`
    );

    return res.status(200).json({
      success: true,
      message: `Successfully upgraded to ${category} category and verified`,
      data: {
        user: updatedUser,
        cost,
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
    const upgradeCostMap = {
      "Sugar Mummy": 50,
      Sponsor: 50,
      "Ben 10": 30,
    };

    // Format as array for easier frontend consumption
    const categories = [
      {
        category: "Sugar Mummy",
        cost: upgradeCostMap["Sugar Mummy"],
        description: "Connect with verified Sugar Mummy profiles",
      },
      {
        category: "Sponsor",
        cost: upgradeCostMap["Sponsor"],
        description: "Connect with verified Sponsor profiles",
      },
      {
        category: "Ben 10",
        cost: upgradeCostMap["Ben 10"],
        description: "Connect with verified Ben 10 profiles",
      },
    ];

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
    const allowed = ["Sugar Mummy", "Sponsor", "Ben 10"];
    if (!allowed.includes(category)) {
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

    const premiumCategories = ["Sugar Mummy", "Sponsor", "Ben 10"];
    const isCurrentUserPremium = premiumCategories.includes(
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
        id: { [Op.ne]: req.publicUserId }, // Exclude current user
      },
      attributes: { exclude: ["password", "otp", "phone"] },
      order: [
        ["boost_score", "DESC"],
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
