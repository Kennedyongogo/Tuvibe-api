const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Subscription = sequelize.define(
    "Subscription",
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
      plan: {
        type: DataTypes.ENUM("Silver", "Gold"),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "KES",
      },
      reference: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "active", "expired", "cancelled"),
        allowNull: false,
        defaultValue: "pending",
      },
      starts_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      authorization_code: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Paystack authorization code for auto-renewal",
      },
      auto_renew_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Whether subscription should auto-renew",
      },
      cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "When the subscription was cancelled",
      },
    },
    {
      tableName: "subscriptions",
      timestamps: true,
    }
  );

  return Subscription;
};
