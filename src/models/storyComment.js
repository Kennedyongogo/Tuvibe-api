const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StoryComment = sequelize.define(
    "StoryComment",
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
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "public_users",
          key: "id",
        },
        field: "user_id",
      },
      parent_comment_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "story_comments",
          key: "id",
        },
        field: "parent_comment_id",
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_edited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "is_edited",
      },
    },
    {
      tableName: "story_comments",
      timestamps: true,
      indexes: [
        {
          fields: ["story_id"],
        },
        {
          fields: ["user_id"],
        },
        {
          fields: ["parent_comment_id"],
        },
      ],
    }
  );

  return StoryComment;
};

