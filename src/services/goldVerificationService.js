const { getActiveSubscriptionForUser } = require("./subscriptionService");

const syncGoldVerificationBadge = async (user) => {
  if (!user || user.category !== "Regular") {
    return user;
  }

  try {
    const subscription = await getActiveSubscriptionForUser(user.id);
    const shouldHaveBadge = Boolean(subscription && subscription.plan === "Gold");

    if (user.isVerified === shouldHaveBadge) {
      return user;
    }

    await user.update({ isVerified: shouldHaveBadge });
    user.isVerified = shouldHaveBadge;
  } catch (error) {
    console.error("syncGoldVerificationBadge error:", error);
  }

  return user;
};

module.exports = {
  syncGoldVerificationBadge,
};

