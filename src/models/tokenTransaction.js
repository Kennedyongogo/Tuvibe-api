const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const TokenTransaction = sequelize.define(
    "TokenTransaction",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      public_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "public_users", key: "id" },
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      transaction_type: {
        type: DataTypes.ENUM("purchase", "deduction", "bonus"),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      payment_method: {
        type: DataTypes.ENUM("mpesa", "airtel", "card", "system"),
        allowNull: false,
        defaultValue: "system",
      },
      reference: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "token_transactions",
      timestamps: true,
      updatedAt: false,
    }
  );

  return TokenTransaction;
};
