const { Op } = require("sequelize");
const {
  PublicUser,
  ProfileView,
  ChatUnlock,
  ProfileBoost,
} = require("../models");

const PREMIUM_CATEGORIES = ["Sugar Mummy", "Sponsor", "Ben 10", "Urban Chics"];

const RECENT_LIMIT = 20;

const toNumber = (value) => (value == null ? null : Number(value));

const hasPremiumAccess = async (user) => {
  if (!user) return false;
  
  // Check if user has isVerified badge (which is synced with active subscription)
  if (user.isVerified) return true;
  
  // For premium category users, verify they have an active subscription
  if (PREMIUM_CATEGORIES.includes(user.category)) {
    const { getActiveSubscriptionForUser } = require("../services/subscriptionService");
    const subscription = await getActiveSubscriptionForUser(user.id);
    // Only grant access if they have an active subscription
    return Boolean(subscription && subscription.status === "active");
  }
  
  return false;
};

const mapViewer = (view) => {
  if (!view) return null;
  const viewer = view.viewer || null;
  return {
    id: viewer?.id ?? null,
    username: viewer?.username ?? null,
    name: viewer?.name ?? null,
    category: viewer?.category ?? null,
    isVerified: viewer?.isVerified ?? false,
    photo: viewer?.photo ?? null,
    viewedAt: view.viewed_at,
  };
};

const mapUnlocker = (unlock) => {
  if (!unlock) return null;
  const initiator = unlock.initiator || null;
  return {
    id: initiator?.id ?? null,
    username: initiator?.username ?? null,
    name: initiator?.name ?? null,
    category: initiator?.category ?? null,
    isVerified: initiator?.isVerified ?? false,
    photo: initiator?.photo ?? null,
    unlockedAt: unlock.createdAt,
    tokenCost: toNumber(unlock.token_cost),
  };
};

exports.getPremiumOverview = async (req, res) => {
  const user = req.publicUser;
  const userId = user?.id;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "User context not available." });
  }

  // Check if user has active subscription (required for statistics access)
  // Note: Boosts also require subscriptions, so checking boost access is redundant
  const hasAccess = await hasPremiumAccess(user);
  if (!hasAccess) {
    console.warn("[PremiumStats] Access denied – active subscription required", {
      userId,
    });
    return res.status(403).json({
      success: false,
      message: "Active subscription required to view statistics.",
    });
  }


  const now = new Date();

  try {
    // Fetch active boost for statistics display (not for access control)
    let activeBoost = null;
    try {
      activeBoost = await ProfileBoost.findOne({
        where: {
          public_user_id: userId,
          status: "active",
          ends_at: { [Op.gt]: now },
        },
        order: [["ends_at", "DESC"]],
      });
    } catch (error) {
      console.error("[PremiumStats] Failed to fetch active boost", {
        userId,
        error,
      });
    }

    const [
      totalViews,
      uniqueViewers,
      recentViews,
      totalUnlocks,
      recentUnlocks,
      totalBoosts,
    ] = await Promise.all([
      ProfileView.count({ where: { viewed_id: userId } }),
      ProfileView.count({
        where: { viewed_id: userId },
        distinct: true,
        col: "viewer_id",
      }),
      ProfileView.findAll({
        where: { viewed_id: userId },
        include: [
          {
            model: PublicUser,
            as: "viewer",
            attributes: [
              "id",
              "username",
              "name",
              "category",
              "isVerified",
              "photo",
            ],
          },
        ],
        order: [["viewed_at", "DESC"]],
        limit: RECENT_LIMIT,
      }),
      ChatUnlock.count({
        where: { target_user_id: userId, status: "success" },
      }),
      ChatUnlock.findAll({
        where: { target_user_id: userId, status: "success" },
        include: [
          {
            model: PublicUser,
            as: "initiator",
            attributes: [
              "id",
              "username",
              "name",
              "category",
              "isVerified",
              "photo",
            ],
          },
        ],
        order: [["createdAt", "DESC"]],
        limit: RECENT_LIMIT,
      }),
      ProfileBoost.count({ where: { public_user_id: userId } }),
    ]);

    let viewsDuringActiveBoost = 0;
    if (activeBoost) {
      viewsDuringActiveBoost = await ProfileView.count({
        where: {
          viewed_id: userId,
          viewed_at: {
            [Op.between]: [activeBoost.starts_at, activeBoost.ends_at],
          },
        },
      });
    }

    const payload = {
      success: true,
      data: {
        profileViews: {
          total: totalViews,
          uniqueViewers,
          recent: recentViews.map(mapViewer).filter(Boolean),
        },
        contactUnlocks: {
          total: totalUnlocks,
          recent: recentUnlocks.map(mapUnlocker).filter(Boolean),
        },
        boostStatus: {
          totalBoosts,
          active: activeBoost
            ? {
                id: activeBoost.id,
                targetCategory: activeBoost.target_category,
                targetArea: activeBoost.target_area,
                startsAt: activeBoost.starts_at,
                endsAt: activeBoost.ends_at,
                status: activeBoost.status,
                viewsDuringActiveWindow: viewsDuringActiveBoost,
              }
            : null,
        },
      },
    };


    return res.json(payload);
  } catch (error) {
    console.error("[PremiumStats] Failed to fetch overview", {
      userId,
      error,
    });
    return res.status(500).json({
      success: false,
      message: "Could not fetch premium statistics.",
    });
  }
};
