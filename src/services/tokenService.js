const { Sequelize } = require("sequelize");
const { PublicUser, TokenTransaction } = require("../models");

exports.addTokens = async (publicUserId, amount, metadata = {}) => {
  if (amount <= 0) throw new Error("Amount must be positive");
  const user = await PublicUser.findByPk(publicUserId);
  if (!user) throw new Error("User not found");
  const newBalance = Number(user.token_balance || 0) + Number(amount);
  await user.update({ token_balance: newBalance });
  await TokenTransaction.create({
    public_user_id: publicUserId,
    amount,
    transaction_type: "purchase",
    description: metadata.description || "Token purchase",
    payment_method: metadata.payment_method || "system",
    reference: metadata.reference || null,
  });
  return newBalance;
};

exports.deductTokens = async (publicUserId, amount, description = "") => {
  if (amount <= 0) throw new Error("Amount must be positive");
  const user = await PublicUser.findByPk(publicUserId);
  if (!user) throw new Error("User not found");
  const current = Number(user.token_balance || 0);
  if (current < amount) {
    const err = new Error("Insufficient tokens");
    err.code = "INSUFFICIENT_TOKENS";
    throw err;
  }
  const newBalance = current - Number(amount);
  await user.update({ token_balance: newBalance });
  await TokenTransaction.create({
    public_user_id: publicUserId,
    amount: -Number(amount),
    transaction_type: "deduction",
    description,
    payment_method: "system",
  });
  return newBalance;
};
