const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProfileBoost = sequelize.define(
    "ProfileBoost",
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
      target_category: {
        type: DataTypes.ENUM("Regular", "Sugar Mummy", "Sponsor", "Ben 10"),
        allowNull: false,
      },
      target_area: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      price_kes: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 10,
      },
      starts_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      ends_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("active", "expired"),
        allowNull: false,
        defaultValue: "active",
      },
    },
    {
      tableName: "profile_boosts",
      timestamps: true,
    }
  );

  return ProfileBoost;
};
