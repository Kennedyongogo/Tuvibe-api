const { getActiveSubscriptionForUser, getPremiumPlanConfig } = require("./subscriptionService");

const PREMIUM_CATEGORIES = ["Sugar Mummy", "Sponsor", "Ben 10", "Urban Chics"];

const syncPremiumBadge = async (user) => {
  if (!user || !PREMIUM_CATEGORIES.includes(user.category)) {
    return user;
  }

  try {
    const subscription = await getActiveSubscriptionForUser(user.id);
    const plan = subscription ? getPremiumPlanConfig(subscription) : null;

    if (!plan || !subscription) {
      // No active subscription - remove badge
      if (user.isVerified) {
        await user.update({ isVerified: false });
        user.isVerified = false;
      }
      return user;
    }

    // Gold plan gets gold badge (isVerified: true)
    // Silver plan gets silver badge (we'll use a different field or keep isVerified for now)
    // For now, both Silver and Gold get isVerified: true
    // You can add a separate field like premiumBadgeType if needed
    const shouldHaveBadge = subscription.plan === "Gold" || subscription.plan === "Silver";

    if (user.isVerified !== shouldHaveBadge) {
      await user.update({ isVerified: shouldHaveBadge });
      user.isVerified = shouldHaveBadge;
    }
  } catch (error) {
    console.error("syncPremiumBadge error:", error);
  }

  return user;
};

const getPremiumBadgeType = async (user) => {
  if (!user || !PREMIUM_CATEGORIES.includes(user.category)) {
    return null;
  }

  try {
    const subscription = await getActiveSubscriptionForUser(user.id);
    const plan = subscription ? getPremiumPlanConfig(subscription) : null;

    if (!plan || !subscription) {
      return null;
    }

    return plan.badgeType || null; // "silver" or "gold"
  } catch (error) {
    console.error("getPremiumBadgeType error:", error);
    return null;
  }
};

module.exports = {
  syncPremiumBadge,
  getPremiumBadgeType,
  PREMIUM_CATEGORIES,
};

