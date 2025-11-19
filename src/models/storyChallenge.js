const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StoryChallenge = sequelize.define(
    "StoryChallenge",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
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
      hashtag: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      cover_image_url: {
        type: DataTypes.STRING,
        allowNull: true,
        field: "cover_image_url",
      },
      start_date: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "start_date",
      },
      end_date: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "end_date",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: "is_active",
      },
      participant_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "participant_count",
      },
    },
    {
      tableName: "story_challenges",
      timestamps: true,
      indexes: [
        {
          fields: ["hashtag"],
        },
        {
          fields: ["is_active", "start_date"],
        },
        {
          fields: ["created_by"],
        },
      ],
    }
  );

  return StoryChallenge;
};

