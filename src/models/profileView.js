const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProfileView = sequelize.define(
    "ProfileView",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      viewer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "public_users", key: "id" },
        comment: "Who viewed the profile",
      },
      viewed_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "public_users", key: "id" },
        comment: "Whose profile was viewed",
      },
      viewed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: "When the profile was viewed (for cooldown tracking)",
      },
    },
    {
      tableName: "profile_views",
      timestamps: true,
      updatedAt: false,
      indexes: [
        {
          fields: ["viewed_id"],
          name: "idx_viewed_id",
        },
        {
          fields: ["viewer_id"],
          name: "idx_viewer_id",
        },
        {
          fields: ["viewed_at"],
          name: "idx_viewed_at",
        },
        {
          fields: ["viewer_id", "viewed_id"],
          name: "idx_viewer_viewed",
        },
      ],
    }
  );

  return ProfileView;
};

