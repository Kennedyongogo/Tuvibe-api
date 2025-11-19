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
          "clap"
        ),
        defaultValue: "like",
        field: "reaction_type",
      },
    },
    {
      tableName: "story_reactions",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["story_id", "user_id"],
        },
        {
          fields: ["story_id"],
        },
        {
          fields: ["user_id"],
        },
      ],
    }
  );

  return StoryReaction;
};

