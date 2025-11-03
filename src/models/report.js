const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Report = sequelize.define(
    "Report",
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
      reported_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "public_users", key: "id" },
      },
      category: {
        type: DataTypes.ENUM(
          "inappropriate_content",
          "harassment",
          "scam",
          "fake_profile",
          "spam",
          "payment_issue",
          "technical_issue",
          "other"
        ),
        allowNull: false,
      },
      subject: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "in_review",
          "resolved",
          "rejected",
          "closed"
        ),
        allowNull: false,
        defaultValue: "pending",
      },
      priority: {
        type: DataTypes.ENUM("low", "medium", "high", "urgent"),
        allowNull: false,
        defaultValue: "medium",
      },
      admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "admin_users", key: "id" },
      },
      admin_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      resolution_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "reports",
      timestamps: true,
    }
  );

  return Report;
};
