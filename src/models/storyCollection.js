const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StoryCollection = sequelize.define(
    "StoryCollection",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "public_users",
          key: "id",
        },
        field: "created_by",
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      cover_image_url: {
        type: DataTypes.STRING,
        allowNull: true,
        field: "cover_image_url",
      },
      is_public: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: "is_public",
      },
      story_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "story_count",
      },
    },
    {
      tableName: "story_collections",
      timestamps: true,
      indexes: [
        {
          fields: ["created_by"],
        },
        {
          fields: ["is_public"],
        },
      ],
    }
  );

  return StoryCollection;
};

