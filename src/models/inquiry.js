const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Inquiry = sequelize.define(
    "Inquiry",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      full_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM("volunteer", "education", "mental_health", "community", "donation", "partnership"),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("pending", "in_progress", "resolved"),
        defaultValue: "pending",
      },
      updated_by: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: "Array of admin user IDs who updated the inquiry",
      },
      description_updates: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: "Array of description updates with timestamps",
      },
    },
    {
      tableName: "inquiries",
      timestamps: true,
    }
  );

  return Inquiry;
};

