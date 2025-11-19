const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Story = sequelize.define(
    "Story",
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
        type: DataTypes.ENUM("photo", "video"),
        allowNull: false,
        field: "media_type",
      },
      media_url: {
        type: DataTypes.STRING,
        allowNull: false,
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
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "expires_at",
      },
      is_highlight: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "is_highlight",
      },
      highlight_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "story_highlights",
          key: "id",
        },
        field: "highlight_id",
      },
      collection_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "story_collections",
          key: "id",
        },
        field: "collection_id",
      },
      challenge_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "story_challenges",
          key: "id",
        },
        field: "challenge_id",
      },
      scheduled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "scheduled_at",
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
      view_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "view_count",
      },
      reaction_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "reaction_count",
      },
      comment_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "comment_count",
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: "Additional metadata like filters, stickers, polls, etc.",
      },
    },
    {
      tableName: "stories",
      timestamps: true,
      indexes: [
        {
          fields: ["public_user_id"],
        },
        {
          fields: ["expires_at"],
        },
        {
          fields: ["is_published", "expires_at"],
        },
        {
          fields: ["location"],
        },
        {
          fields: ["challenge_id"],
        },
        {
          fields: ["collection_id"],
        },
      ],
    }
  );

  return Story;
};

