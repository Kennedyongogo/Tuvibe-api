const PREMIUM_CATEGORIES = ["Sugar Mummy", "Sponsor", "Ben 10", "Urban Chics"];

const TOKENS_PER_KSH = Number(process.env.TOKENS_PER_KSH || "10");

if (!Number.isFinite(TOKENS_PER_KSH) || TOKENS_PER_KSH <= 0) {
  throw new Error("TOKENS_PER_KSH must be a positive number");
}

const convertKshToTokens = (kshAmount) => {
  const amountNumber = Number(kshAmount);
  if (!Number.isFinite(amountNumber) || amountNumber < 0) {
    throw new Error("Invalid amount supplied for conversion");
  }
  return Math.round(amountNumber * TOKENS_PER_KSH);
};

const BOOST_PRICE_KSH = Number(process.env.BOOST_PRICE_KSH || "10");
const BOOST_DURATION_HOURS = Number(process.env.BOOST_DURATION_HOURS || "1");
const PREMIUM_UPGRADE_PRICE_KSH = Number(
  process.env.PREMIUM_UPGRADE_PRICE_KSH || "100"
);

const CHAT_COST_RULES_KSH = {
  normalToNormal: 2.5,
  normalToPremium: 25,
  premiumToNormal: 2.5,
  premiumToPremium: Number(
    process.env.CHAT_COST_PREMIUM_TO_PREMIUM_KSH || "2.5"
  ),
};

module.exports = {
  PREMIUM_CATEGORIES,
  TOKENS_PER_KSH,
  convertKshToTokens,
  BOOST_PRICE_KSH,
  BOOST_DURATION_HOURS,
  BOOST_PRICE_TOKENS: convertKshToTokens(BOOST_PRICE_KSH),
  PREMIUM_UPGRADE_PRICE_KSH,
  PREMIUM_UPGRADE_PRICE_TOKENS: convertKshToTokens(PREMIUM_UPGRADE_PRICE_KSH),
  CHAT_COST_RULES_KSH,
  CHAT_COST_RULES_TOKENS: {
    normalToNormal: convertKshToTokens(CHAT_COST_RULES_KSH.normalToNormal),
    normalToPremium: convertKshToTokens(CHAT_COST_RULES_KSH.normalToPremium),
    premiumToNormal: convertKshToTokens(CHAT_COST_RULES_KSH.premiumToNormal),
    premiumToPremium: convertKshToTokens(CHAT_COST_RULES_KSH.premiumToPremium),
  },
};
