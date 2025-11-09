const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProfileTag = sequelize.define(
    "ProfileTag",
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
      tagged_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "public_users", key: "id" },
      },
      category: {
        type: DataTypes.ENUM(
          "inappropriate_content",
          "harassment",
          "scam",
          "fake_profile",
          "spam",
          "other"
        ),
        allowNull: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "profile_tags",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["public_user_id", "tagged_user_id", "category"],
          name: "uniq_user_tag_category",
        },
      ],
    }
  );

  return ProfileTag;
};

