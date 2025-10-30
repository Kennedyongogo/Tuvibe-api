const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Project = sequelize.define(
    "Project",
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
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM("volunteer", "education", "mental_health", "community", "donation", "partnership"),
        allowNull: false,
      },
      county: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      subcounty: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      target_individual: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "in_progress", "on_hold", "completed"),
        defaultValue: "pending",
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
      },
      assigned_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
      },
      assigned_to: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
      },
      start_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      end_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      longitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
      },
      latitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      progress: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 100,
        },
      },
      update_images: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: "Array of image paths added when updating status",
      },
      progress_descriptions: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: "Array of progress update descriptions",
      },
      updated_by: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: "Array of admin user IDs who updated the status",
      },
    },
    {
      tableName: "projects",
      timestamps: true,
    }
  );

  return Project;
};

