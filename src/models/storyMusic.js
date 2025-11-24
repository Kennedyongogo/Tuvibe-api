const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StoryMusic = sequelize.define(
    "StoryMusic",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Song title",
      },
      artist: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Artist name",
      },
      audio_url: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "audio_url",
        comment: "URL to the audio file",
      },
      cover_image_url: {
        type: DataTypes.STRING,
        allowNull: true,
        field: "cover_image_url",
        comment: "Album cover or thumbnail image URL",
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Duration in seconds",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: "is_active",
        comment: "Whether this music track is available for use",
      },
      order: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: "Display order for sorting",
      },
    },
    {
      tableName: "story_music",
      timestamps: true,
      indexes: [
        {
          fields: ["is_active"],
        },
        {
          fields: ["order"],
        },
      ],
    }
  );

  return StoryMusic;
};


