const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PublicUser = sequelize.define(
    "PublicUser",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      gender: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      age: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      birth_year: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1900,
          isInt: true,
        },
        field: "birth_year",
      },
      county: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      category: {
        type: DataTypes.ENUM(
          "Regular",
          "Sugar Mummy",
          "Sponsor",
          "Ben 10",
          "Urban Chics"
        ),
        allowNull: false,
        defaultValue: "Regular",
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      google_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        field: "google_id",
      },
      auth_provider: {
        type: DataTypes.ENUM("local", "google"),
        allowNull: false,
        defaultValue: "local",
        field: "auth_provider",
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      photo: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      photo_moderation_status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: true,
        defaultValue: null,
      },
      photos: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: "Array of additional photos with moderation status",
      },
      bio_moderation_status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: true,
        defaultValue: null,
      },
      last_seen_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "last_seen_at",
      },
      logged_in_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "logged_in_at",
      },
      logged_out_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "logged_out_at",
      },
      is_online: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "is_online",
      },
      token_balance: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        field: "token_balance",
      },
      isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "is_verified",
      },
      is_fake: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "is_fake",
        comment: "Marks admin-created fake profiles for display and testing",
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      profile_views: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: "Total number of profile views (with cooldown)",
      },
      premium_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "premium_expires_at",
      },
      incognito_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "incognito_expires_at",
        comment: "When incognito mode ends (subscription benefit)",
      },
      rating_prompt_dismissed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "rating_prompt_dismissed_at",
        comment:
          "When user dismissed the rating prompt (prompts again after 3 days)",
      },
    },
    {
      tableName: "public_users",
      timestamps: true,
    }
  );

  return PublicUser;
};
