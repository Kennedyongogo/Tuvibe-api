const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PostReaction = sequelize.define(
    "PostReaction",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      post_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "posts",
          key: "id",
        },
        field: "post_id",
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
        type: DataTypes.STRING(10),
        allowNull: true,
        field: "emoji",
        comment: "Emoji character for emoji reactions",
      },
    },
    {
      tableName: "post_reactions",
      timestamps: true,
      indexes: [
        {
          fields: ["post_id"],
        },
        {
          fields: ["user_id"],
        },
        {
          fields: ["post_id", "user_id"],
        },
      ],
    }
  );

  return PostReaction;
};
