const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PremiumVerification = sequelize.define(
    "PremiumVerification",
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
      admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "admin_users", key: "id" },
      },
      verification_status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "premium_verifications",
      timestamps: true,
      updatedAt: false,
    }
  );

  return PremiumVerification;
};
