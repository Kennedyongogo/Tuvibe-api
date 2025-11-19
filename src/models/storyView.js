const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StoryView = sequelize.define(
    "StoryView",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      story_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "stories",
          key: "id",
        },
        field: "story_id",
      },
      viewer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "public_users",
          key: "id",
        },
        field: "viewer_id",
      },
      viewed_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: "viewed_at",
      },
    },
    {
      tableName: "story_views",
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ["story_id", "viewer_id"],
        },
        {
          fields: ["story_id"],
        },
        {
          fields: ["viewer_id"],
        },
      ],
    }
  );

  return StoryView;
};

