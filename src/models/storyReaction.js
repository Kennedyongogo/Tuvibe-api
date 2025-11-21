const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StoryReaction = sequelize.define(
    "StoryReaction",
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
      reaction_type: {
        type: DataTypes.ENUM(
          "like",
          "love",
          "laugh",
          "wow",
          "sad",
          "angry",
          "fire",
          "clap",
          "emoji"
        ),
        defaultValue: "like",
        field: "reaction_type",
      },
      emoji: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "emoji",
        comment:
          "Emoji character(s) for emoji reactions - can be single emoji or comma-separated multiple emojis",
      },
    },
    {
      tableName: "story_reactions",
      timestamps: true,
      indexes: [
        {
          fields: ["story_id"],
        },
        {
          fields: ["user_id"],
        },
        {
          fields: ["story_id", "user_id"],
        },
      ],
    }
  );

  return StoryReaction;
};
