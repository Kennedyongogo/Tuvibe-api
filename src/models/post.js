const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Post = sequelize.define(
    "Post",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      public_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "public_users",
          key: "id",
        },
        field: "public_user_id",
      },
      media_type: {
        type: DataTypes.ENUM("photo", "video", "text"),
        allowNull: false,
        field: "media_type",
      },
      media_url: {
        type: DataTypes.STRING,
        allowNull: true, // Allow null for text posts
        field: "media_url",
      },
      thumbnail_url: {
        type: DataTypes.STRING,
        allowNull: true,
        field: "thumbnail_url",
      },
      caption: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      is_published: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: "is_published",
      },
      moderation_status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        defaultValue: "pending",
        field: "moderation_status",
      },
      reaction_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "reaction_count",
      },
      like_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "like_count",
      },
      emoji_reaction_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "emoji_reaction_count",
      },
      comment_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "comment_count",
      },
      share_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "share_count",
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: "Additional metadata like filters, stickers, polls, etc.",
      },
    },
    {
      tableName: "posts",
      timestamps: true,
      indexes: [
        {
          fields: ["public_user_id"],
        },
        {
          fields: ["is_published", "moderation_status"],
        },
        {
          fields: ["createdAt"],
        },
        {
          fields: ["location"],
        },
      ],
    }
  );

  return Post;
};
