const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StoryHighlight = sequelize.define(
    "StoryHighlight",
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
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      cover_image_url: {
        type: DataTypes.STRING,
        allowNull: true,
        field: "cover_image_url",
      },
      order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      tableName: "story_highlights",
      timestamps: true,
      indexes: [
        {
          fields: ["public_user_id"],
        },
      ],
    }
  );

  return StoryHighlight;
};

