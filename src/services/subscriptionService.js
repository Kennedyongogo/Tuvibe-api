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
  },
  Gold: {
    whatsappContactsPerDay: Infinity,
    whoViewedPerDay: Infinity,
    premiumUnlocksPerDay: Infinity,
    maxFavourites: Infinity,
    maxUnlockedProfiles: Infinity,
    boostsPerDay: 3,
    suggestedMatchesPerDay: 5,
  },
};

const getActiveSubscriptionForUser = async (publicUserId) => {
  const now = new Date();
  return Subscription.findOne({
    where: {
      public_user_id: publicUserId,
      status: "active",
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
    };
  }

  usage[fieldName] = current + 1;
  await usage.save();

  return {
    used: true,
    allowed: true,
    limit,
    usedCount: usage[fieldName],
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

module.exports = {
  REGULAR_PLANS,
  getActiveSubscriptionForUser,
  useWhatsappContactForRegular,
  useWhoViewedForRegular,
  usePremiumUnlockForRegular,
  useBoostForRegular,
  useSuggestedMatchesForRegular,
};
