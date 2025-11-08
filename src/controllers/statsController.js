const {
  AdminUser,
  PublicUser,
  TokenTransaction,
  ChatUnlock,
  PremiumVerification,
  MarketItem,
  LookingForPost,
  Favourite,
  Payment,
  Notification,
  ProfileView,
  ProfileBoost,
} = require("../models");
const { Op, fn, col } = require("sequelize");

// Helper function to get date ranges for filtering
const getDateRanges = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = new Date(today);
  thisWeek.setDate(today.getDate() - 7);
  const thisMonth = new Date(today);
  thisMonth.setMonth(today.getMonth() - 1);
  const thisYear = new Date(today);
  thisYear.setMonth(0, 1);

  return { today, thisWeek, thisMonth, thisYear };
};

// Consolidated Dashboard Stats Endpoint
exports.getDashboardStats = async (req, res) => {
  try {
    const { today, thisWeek, thisMonth, thisYear } = getDateRanges();

    // ==================== OVERVIEW STATS ====================
    const overview = {
      totalUsers: await PublicUser.count(),
      totalAdmins: await AdminUser.count(),
      totalMarketItems: await MarketItem.count(),
      totalPremiumUsers: await PublicUser.count({
        where: { isVerified: true },
      }),
      onlineUsers: await PublicUser.count({ where: { is_online: true } }),
      pendingVerifications: await PremiumVerification.count({
        where: { verification_status: "pending" },
      }),
    };

    // User breakdown by category
    const usersByCategory = await PublicUser.findAll({
      attributes: [
        "category",
        [require("sequelize").fn("count", require("sequelize").col("id")), "count"],
      ],
      group: ["category"],
      raw: true,
    });

    const categoryBreakdown = {
      Regular: 0,
      "Sugar Mummy": 0,
      Sponsor: 0,
      "Ben 10": 0,
    };
    usersByCategory.forEach((row) => {
      if (categoryBreakdown.hasOwnProperty(row.category)) {
        categoryBreakdown[row.category] = parseInt(row.count) || 0;
      }
    });

    // ==================== TOKEN STATS ====================
    const tokenStats = {
      totalTokensInCirculation: await TokenTransaction.sum("amount", {
        where: { transaction_type: "purchase" },
      }).then((v) => Number(v || 0)),
      totalTokensDeducted: await TokenTransaction.sum("amount", {
        where: { transaction_type: "deduction" },
      }).then((v) => Math.abs(Number(v || 0))), // Convert negative sum to positive
      totalTokensBonus: await TokenTransaction.sum("amount", {
        where: { transaction_type: "bonus" },
      }).then((v) => Number(v || 0)),
      // Token transactions by time (all transactions combined)
      tokensToday: await TokenTransaction.sum("amount", {
        where: {
          createdAt: { [Op.gte]: today },
        },
      }).then((v) => Number(v || 0)),
      tokensThisWeek: await TokenTransaction.sum("amount", {
        where: {
          createdAt: { [Op.gte]: thisWeek },
        },
      }).then((v) => Number(v || 0)),
      tokensThisMonth: await TokenTransaction.sum("amount", {
        where: {
          createdAt: { [Op.gte]: thisMonth },
        },
      }).then((v) => Number(v || 0)),
    };

    // Token transactions by payment method
    const tokensByMethod = await TokenTransaction.findAll({
      attributes: [
        "payment_method",
        [
          require("sequelize").fn(
            "sum",
            require("sequelize").col("amount")
          ),
          "total",
        ],
        [
          require("sequelize").fn("count", require("sequelize").col("id")),
          "count",
        ],
      ],
      where: { transaction_type: "purchase" },
      group: ["payment_method"],
      raw: true,
    });

    // ==================== PAYMENT STATS ====================
    const paymentStats = {
      totalRevenue: await Payment.sum("amount", {
        where: { status: "completed" },
      }).then((v) => Number(v || 0)),
      totalPendingPayments: await Payment.sum("amount", {
        where: { status: "pending" },
      }).then((v) => Number(v || 0)),
      totalFailedPayments: await Payment.sum("amount", {
        where: { status: "failed" },
      }).then((v) => Number(v || 0)),
      // Payment activity by time
      revenueToday: await Payment.sum("amount", {
        where: {
          status: "completed",
          createdAt: { [Op.gte]: today },
        },
      }).then((v) => Number(v || 0)),
      revenueThisWeek: await Payment.sum("amount", {
        where: {
          status: "completed",
          createdAt: { [Op.gte]: thisWeek },
        },
      }).then((v) => Number(v || 0)),
      revenueThisMonth: await Payment.sum("amount", {
        where: {
          status: "completed",
          createdAt: { [Op.gte]: thisMonth },
        },
      }).then((v) => Number(v || 0)),
    };

    // Payments by method
    const paymentsByMethod = await Payment.findAll({
      attributes: [
        "method",
        [
          require("sequelize").fn(
            "sum",
            require("sequelize").col("amount")
          ),
          "total",
        ],
        [
          require("sequelize").fn("count", require("sequelize").col("id")),
          "count",
        ],
      ],
      where: { status: "completed" },
      group: ["method"],
      raw: true,
    });

    // ==================== PREMIUM USER STATS ====================
    const premiumStats = {
      totalVerified: await PublicUser.count({
        where: { isVerified: true },
      }),
      // Breakdown by premium category
      sugarMummys: await PublicUser.count({
        where: { category: "Sugar Mummy", isVerified: true },
      }),
      sponsors: await PublicUser.count({
        where: { category: "Sponsor", isVerified: true },
      }),
      ben10s: await PublicUser.count({
        where: { category: "Ben 10", isVerified: true },
      }),
      // Verification requests
      pendingRequests: await PremiumVerification.count({
        where: { verification_status: "pending" },
      }),
      approvedRequests: await PremiumVerification.count({
        where: { verification_status: "approved" },
      }),
      rejectedRequests: await PremiumVerification.count({
        where: { verification_status: "rejected" },
      }),
      // Looking For posts
      totalLookingForPosts: await LookingForPost.count(),
    };

    // ==================== MARKET STATS ====================
    const marketStats = {
      totalItems: await MarketItem.count(),
      featuredItems: await MarketItem.count({
        where: { is_featured: true },
      }),
      hotDeals: await MarketItem.count({
        where: { tag: "hot_deals" },
      }),
      weekendPicks: await MarketItem.count({
        where: { tag: "weekend_picks" },
      }),
      regularItems: await MarketItem.count({
        where: { tag: "none" },
      }),
      // Market items added by time
      itemsAddedToday: await MarketItem.count({
        where: { createdAt: { [Op.gte]: today } },
      }),
      itemsAddedThisWeek: await MarketItem.count({
        where: { createdAt: { [Op.gte]: thisWeek } },
      }),
      itemsAddedThisMonth: await MarketItem.count({
        where: { createdAt: { [Op.gte]: thisMonth } },
      }),
    };

    // ==================== ENGAGEMENT STATS ====================
    const engagementStats = {
      totalChatUnlocks: await ChatUnlock.count({
        where: { status: "success" },
      }),
      totalFavourites: await Favourite.count(),
      totalProfileViews: await ProfileView.count(),
      totalNotifications: await Notification.count(),
      // Activity by time
      unlocksToday: await ChatUnlock.count({
        where: {
          status: "success",
          createdAt: { [Op.gte]: today },
        },
      }),
      unlocksThisWeek: await ChatUnlock.count({
        where: {
          status: "success",
          createdAt: { [Op.gte]: thisWeek },
        },
      }),
      unlocksThisMonth: await ChatUnlock.count({
        where: {
          status: "success",
          createdAt: { [Op.gte]: thisMonth },
        },
      }),
    };

    // Chat unlocks by category (who was contacted)
    const unlocksByCategory = await ChatUnlock.findAll({
      attributes: [
        [
          require("sequelize").fn(
            "count",
            require("sequelize").col("ChatUnlock.id")
          ),
          "count",
        ],
      ],
      include: [
        {
          model: PublicUser,
          as: "target",
          attributes: ["category"],
          required: true,
        },
      ],
      where: { status: "success" },
      group: ["target.category"],
      raw: true,
    });

    // ==================== BOOST STATS ====================
    const now = new Date();
    const boostUserGroups = await ProfileBoost.findAll({
      attributes: [
        "public_user_id",
        [fn("COUNT", col("ProfileBoost.id")), "count"],
      ],
      group: ["public_user_id"],
      raw: true,
    });
    const averageBoosts =
      boostUserGroups.length === 0
        ? "0.00"
        : (
            boostUserGroups.reduce(
              (sum, row) => sum + Number(row.count || 0),
              0
            ) / boostUserGroups.length
          ).toFixed(2);

    const boostStats = {
      // Total boosts purchased (count of boost transactions)
      totalBoostsPurchased: await TokenTransaction.count({
        where: {
          transaction_type: "deduction",
          description: { [Op.like]: "%Profile boost%" },
        },
      }),
      // Total tokens spent on boosts
      totalTokensSpentOnBoosts: await TokenTransaction.sum("amount", {
        where: {
          transaction_type: "deduction",
          description: { [Op.like]: "%Profile boost%" },
        },
      }).then((v) => Math.abs(Number(v || 0))),
      // Active boosts (profiles with an active ProfileBoost record)
      activeBoosts: await ProfileBoost.count({
        where: {
          status: "active",
          ends_at: { [Op.gt]: now },
        },
      }),
      // Users with at least one boost record
      usersWithBoostHistory: await ProfileBoost.count({
        distinct: true,
        col: "public_user_id",
      }),
      // Average boosts purchased per user (among users who have boosted)
      averageBoostScore: averageBoosts,
      // Boost purchases by time period
      boostsToday: await TokenTransaction.count({
        where: {
          transaction_type: "deduction",
          description: { [Op.like]: "%Profile boost%" },
          createdAt: { [Op.gte]: today },
        },
      }),
      boostsThisWeek: await TokenTransaction.count({
        where: {
          transaction_type: "deduction",
          description: { [Op.like]: "%Profile boost%" },
          createdAt: { [Op.gte]: thisWeek },
        },
      }),
      boostsThisMonth: await TokenTransaction.count({
        where: {
          transaction_type: "deduction",
          description: { [Op.like]: "%Profile boost%" },
          createdAt: { [Op.gte]: thisMonth },
        },
      }),
      // Tokens spent on boosts by time period
      boostTokensToday: await TokenTransaction.sum("amount", {
        where: {
          transaction_type: "deduction",
          description: { [Op.like]: "%Profile boost%" },
          createdAt: { [Op.gte]: today },
        },
      }).then((v) => Math.abs(Number(v || 0))),
      boostTokensThisWeek: await TokenTransaction.sum("amount", {
        where: {
          transaction_type: "deduction",
          description: { [Op.like]: "%Profile boost%" },
          createdAt: { [Op.gte]: thisWeek },
        },
      }).then((v) => Math.abs(Number(v || 0))),
      boostTokensThisMonth: await TokenTransaction.sum("amount", {
        where: {
          transaction_type: "deduction",
          description: { [Op.like]: "%Profile boost%" },
          createdAt: { [Op.gte]: thisMonth },
        },
      }).then((v) => Math.abs(Number(v || 0))),
    };

    // ==================== NEW USERS BY TIME ====================
    const newUsersStats = {
      today: await PublicUser.count({
        where: { createdAt: { [Op.gte]: today } },
      }),
      thisWeek: await PublicUser.count({
        where: { createdAt: { [Op.gte]: thisWeek } },
      }),
      thisMonth: await PublicUser.count({
        where: { createdAt: { [Op.gte]: thisMonth } },
      }),
    };

    // ==================== RECENT ACTIVITY ====================
    const recentUsers = await PublicUser.findAll({
      attributes: ["id", "name", "email", "category", "isVerified", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 5,
    });

    const recentUnlocks = await ChatUnlock.findAll({
      attributes: ["id", "token_cost", "status", "createdAt"],
      include: [
        {
          model: PublicUser,
          as: "initiator",
          attributes: ["name", "category"],
        },
        {
          model: PublicUser,
          as: "target",
          attributes: ["name", "category"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 5,
    });

    const recentPayments = await Payment.findAll({
      attributes: ["id", "amount", "method", "status", "createdAt"],
      include: [
        {
          model: PublicUser,
          as: "payer",
          attributes: ["name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 5,
    });

    // ==================== RESPONSE ====================
    return res.json({
      success: true,
      data: {
        overview,
        categoryBreakdown,
        tokenStats,
        tokensByMethod,
        paymentStats,
        paymentsByMethod,
        premiumStats,
        marketStats,
        engagementStats,
        unlocksByCategory,
        boostStats,
        newUsersStats,
        recentActivity: {
          recentUsers,
          recentUnlocks,
          recentPayments,
        },
      },
    });
  } catch (err) {
    console.error("getDashboardStats error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard stats" });
  }
};
