const { Op } = require("sequelize");
const { Subscription, SubscriptionUsage } = require("../models");

// Regular user subscription plans and allowances
const REGULAR_PLANS = {
  Silver: {
    whatsappContactsPerDay: 25,
    whoViewedPerDay: 3,
    premiumUnlocksPerDay: 5,
    maxFavourites: 40,
    maxUnlockedProfiles: 50,
    boostsPerDay: 0,
    suggestedMatchesPerDay: 0,
    incognitoMinutesPerDay: 0,
  },
  Gold: {
    whatsappContactsPerDay: Infinity,
    whoViewedPerDay: Infinity,
    premiumUnlocksPerDay: Infinity,
    maxFavourites: Infinity,
    maxUnlockedProfiles: Infinity,
    boostsPerDay: 3,
    suggestedMatchesPerDay: 5,
    incognitoMinutesPerDay: 240,
  },
};

// Premium category user subscription plans and allowances
// For: Sugar Mummy, Sponsor, Ben 10, Urban Chics
const PREMIUM_PLANS = {
  Silver: {
    whatsappContactsPerDay: 35,
    whoViewedPerDay: 6,
    premiumUnlocksPerDay: 10,
    maxFavourites: 60,
    maxUnlockedProfiles: 60,
    boostsPerDay: 2,
    boostDurationHours: 1,
    boostTargetCategories: 1, // Can target one category per boost
    suggestedMatchesPerDay: 0,
    incognitoMinutesPerDay: 0,
    hasPrivateProfileMode: true,
    badgeType: "silver", // Premium lounge silver badge
  },
  Gold: {
    whatsappContactsPerDay: Infinity,
    whoViewedPerDay: Infinity,
    premiumUnlocksPerDay: Infinity,
    maxFavourites: Infinity,
    maxUnlockedProfiles: Infinity,
    boostsPerDay: 4,
    boostDurationHours: 3,
    boostTargetCategories: Infinity, // Can target all categories
    suggestedMatchesPerDay: 10,
    incognitoMinutesPerDay: 480, // 8 hours
    hasPrivateProfileMode: true,
    badgeType: "gold", // Gold verification badge
  },
};

const getActiveSubscriptionForUser = async (publicUserId) => {
  const now = new Date();
  return Subscription.findOne({
    where: {
      public_user_id: publicUserId,
      status: {
        [Op.in]: ["active", "cancelled"], // Include cancelled - still active until expiry
      },
      starts_at: { [Op.lte]: now },
      expires_at: { [Op.gt]: now },
    },
    order: [["starts_at", "DESC"]],
  });
};

const getRegularPlanConfig = (subscription) => {
  if (!subscription) return null;
  return REGULAR_PLANS[subscription.plan] || null;
};

const getPremiumPlanConfig = (subscription) => {
  if (!subscription) return null;
  return PREMIUM_PLANS[subscription.plan] || null;
};

const getOrCreateTodayUsage = async (publicUserId) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  let usage = await SubscriptionUsage.findOne({
    where: {
      public_user_id: publicUserId,
      usage_date: todayStr,
    },
  });

  if (!usage) {
    usage = await SubscriptionUsage.create({
      public_user_id: publicUserId,
      usage_date: todayStr,
      whatsapp_contacts_used: 0,
      who_viewed_used: 0,
      premium_unlocks_used: 0,
      boosts_used: 0,
      suggested_matches_used: 0,
    });
  }

  return usage;
};

// Generic helper for per-day counters
const useDailyAllowance = async ({ publicUserId, fieldName, limit }) => {
  if (!Number.isFinite(limit)) {
    return {
      used: false,
      allowed: true,
      limit: Infinity,
      usedCount: 0,
      remaining: Infinity,
    };
  }

  const usage = await getOrCreateTodayUsage(publicUserId);

  const current = Number(usage[fieldName] || 0);
  if (current >= limit) {
    return {
      used: false,
      allowed: false,
      limit,
      usedCount: current,
      remaining: 0,
    };
  }

  usage[fieldName] = current + 1;
  await usage.save();

  const remaining = Math.max(limit - usage[fieldName], 0);

  return {
    used: true,
    allowed: true,
    limit,
    usedCount: usage[fieldName],
    remaining,
  };
};

// Consume one WhatsApp contact unlock for a regular user's subscription.
// Returns { used, allowed, limit, usedCount, subscription }.
const useWhatsappContactForRegular = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getRegularPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.whatsappContactsPerDay;

  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "whatsapp_contacts_used",
    limit,
  });

  return { ...result, subscription };
};

// Who viewed your profile allowance (Regular plans)
const useWhoViewedForRegular = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getRegularPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.whoViewedPerDay;
  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "who_viewed_used",
    limit,
  });

  return { ...result, subscription };
};

// Premium profile unlock allowance (Regular plans)
const usePremiumUnlockForRegular = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getRegularPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.premiumUnlocksPerDay;
  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "premium_unlocks_used",
    limit,
  });

  return { ...result, subscription };
};

// Boost allowance (Regular plans)
const useBoostForRegular = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getRegularPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.boostsPerDay;
  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "boosts_used",
    limit,
  });

  return { ...result, subscription };
};

// Incognito allowance (Regular plans)
const useIncognitoMinutesForRegular = async (
  publicUserId,
  requestedMinutes = null
) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getRegularPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      remaining: 0,
      consumedMinutes: 0,
      subscription: null,
    };
  }

  const limit = Number.isFinite(plan.incognitoMinutesPerDay)
    ? plan.incognitoMinutesPerDay
    : 0;

  if (!Number.isFinite(limit) || limit <= 0) {
    return {
      used: false,
      allowed: false,
      limit,
      usedCount: 0,
      remaining: 0,
      consumedMinutes: 0,
      subscription,
    };
  }

  const usage = await getOrCreateTodayUsage(publicUserId);
  const used = Number(usage.incognito_minutes_used || 0);

  if (used >= limit) {
    return {
      used: false,
      allowed: false,
      limit,
      usedCount: used,
      remaining: 0,
      consumedMinutes: 0,
      subscription,
    };
  }

  const desiredMinutes =
    Number.isFinite(requestedMinutes) && requestedMinutes > 0
      ? requestedMinutes
      : limit;
  const available = limit - used;
  const minutesToConsume = Math.max(0, Math.min(available, desiredMinutes));

  if (minutesToConsume <= 0) {
    return {
      used: false,
      allowed: false,
      limit,
      usedCount: used,
      remaining: available,
      consumedMinutes: 0,
      subscription,
    };
  }

  usage.incognito_minutes_used = used + minutesToConsume;
  await usage.save();

  return {
    used: true,
    allowed: true,
    limit,
    usedCount: usage.incognito_minutes_used,
    remaining: Math.max(limit - usage.incognito_minutes_used, 0),
    consumedMinutes: minutesToConsume,
    subscription,
  };
};

// Suggested matches allowance (Regular plans)
const useSuggestedMatchesForRegular = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getRegularPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.suggestedMatchesPerDay;
  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "suggested_matches_used",
    limit,
  });

  return { ...result, subscription };
};

// Premium category subscription functions (similar to regular but with premium plans)

// Consume one WhatsApp contact unlock for a premium user's subscription
const useWhatsappContactForPremium = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getPremiumPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.whatsappContactsPerDay;
  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "whatsapp_contacts_used",
    limit,
  });

  return { ...result, subscription };
};

// Who viewed your profile allowance (Premium plans)
const useWhoViewedForPremium = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getPremiumPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.whoViewedPerDay;
  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "who_viewed_used",
    limit,
  });

  return { ...result, subscription };
};

// Premium profile unlock allowance (Premium plans)
const usePremiumUnlockForPremium = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getPremiumPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.premiumUnlocksPerDay;
  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "premium_unlocks_used",
    limit,
  });

  return { ...result, subscription };
};

// Boost allowance (Premium plans)
const useBoostForPremium = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getPremiumPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.boostsPerDay;
  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "boosts_used",
    limit,
  });

  return { ...result, subscription, plan };
};

// Incognito allowance (Premium plans)
const useIncognitoMinutesForPremium = async (
  publicUserId,
  requestedMinutes = null
) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getPremiumPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      remaining: 0,
      consumedMinutes: 0,
      subscription: null,
    };
  }

  const limit = Number.isFinite(plan.incognitoMinutesPerDay)
    ? plan.incognitoMinutesPerDay
    : 0;

  if (!Number.isFinite(limit) || limit <= 0) {
    return {
      used: false,
      allowed: false,
      limit,
      usedCount: 0,
      remaining: 0,
      consumedMinutes: 0,
      subscription,
    };
  }

  const usage = await getOrCreateTodayUsage(publicUserId);
  const used = Number(usage.incognito_minutes_used || 0);

  if (used >= limit) {
    return {
      used: false,
      allowed: false,
      limit,
      usedCount: used,
      remaining: 0,
      consumedMinutes: 0,
      subscription,
    };
  }

  const desiredMinutes =
    Number.isFinite(requestedMinutes) && requestedMinutes > 0
      ? requestedMinutes
      : limit;
  const available = limit - used;
  const minutesToConsume = Math.max(0, Math.min(available, desiredMinutes));

  if (minutesToConsume <= 0) {
    return {
      used: false,
      allowed: false,
      limit,
      usedCount: used,
      remaining: available,
      consumedMinutes: 0,
      subscription,
    };
  }

  usage.incognito_minutes_used = used + minutesToConsume;
  await usage.save();

  return {
    used: true,
    allowed: true,
    limit,
    usedCount: usage.incognito_minutes_used,
    remaining: Math.max(limit - usage.incognito_minutes_used, 0),
    consumedMinutes: minutesToConsume,
    subscription,
  };
};

// Suggested matches allowance (Premium plans)
const useSuggestedMatchesForPremium = async (publicUserId) => {
  const subscription = await getActiveSubscriptionForUser(publicUserId);
  const plan = getPremiumPlanConfig(subscription);

  if (!plan) {
    return {
      used: false,
      allowed: false,
      limit: 0,
      usedCount: 0,
      subscription: null,
    };
  }

  const limit = plan.suggestedMatchesPerDay;
  const result = await useDailyAllowance({
    publicUserId,
    fieldName: "suggested_matches_used",
    limit,
  });

  return { ...result, subscription };
};

module.exports = {
  REGULAR_PLANS,
  PREMIUM_PLANS,
  getActiveSubscriptionForUser,
  getRegularPlanConfig,
  getPremiumPlanConfig,
  useWhatsappContactForRegular,
  useWhoViewedForRegular,
  usePremiumUnlockForRegular,
  useBoostForRegular,
  useIncognitoMinutesForRegular,
  useSuggestedMatchesForRegular,
  // Premium category functions
  useWhatsappContactForPremium,
  useWhoViewedForPremium,
  usePremiumUnlockForPremium,
  useBoostForPremium,
  useIncognitoMinutesForPremium,
  useSuggestedMatchesForPremium,
};
