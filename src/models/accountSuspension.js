const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AccountSuspension = sequelize.define(
    "AccountSuspension",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      public_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      admin_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("active", "revoked"),
        allowNull: false,
        defaultValue: "active",
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "account_suspensions",
      timestamps: true,
      indexes: [
        {
          fields: ["public_user_id", "status"],
        },
      ],
    }
  );

  return AccountSuspension;
};
