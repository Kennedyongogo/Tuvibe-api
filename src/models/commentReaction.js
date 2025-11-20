const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const CommentReaction = sequelize.define(
    "CommentReaction",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      comment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "post_comments",
          key: "id",
        },
        field: "comment_id",
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
      tableName: "comment_reactions",
      timestamps: true,
      indexes: [
        {
          fields: ["comment_id"],
        },
        {
          fields: ["user_id"],
        },
        {
          fields: ["comment_id", "user_id"],
        },
      ],
    }
  );

  return CommentReaction;
};
