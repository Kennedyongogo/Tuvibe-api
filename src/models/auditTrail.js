const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AuditTrail = sequelize.define(
    "AuditTrail",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
        comment: "Admin user who performed the action",
      },
      action: {
        type: DataTypes.ENUM(
          "create",
          "update",
          "delete",
          "login",
          "logout",
          "login_failed",
          "password_change",
          "status_change",
          "role_change",
          "upload",
          "download",
          "export",
          "import",
          "other"
        ),
        allowNull: false,
      },
      resource_type: {
        type: DataTypes.ENUM(
          "admin_user",
          "project",
          "inquiry",
          "document",
          "testimony",
          "system",
          "other"
        ),
        allowNull: false,
      },
      resource_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "ID of the resource being affected",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Human-readable description of the action",
      },
      old_values: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Previous state before the action",
      },
      new_values: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "New state after the action",
      },
      ip_address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("success", "failed", "pending"),
        defaultValue: "success",
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Error message if action failed",
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "Additional contextual data",
      },
    },
    {
      tableName: "audit_trails",
      timestamps: true,
      updatedAt: false, // Audit records should not be updated
      indexes: [
        {
          fields: ["user_id"],
        },
        {
          fields: ["action"],
        },
        {
          fields: ["resource_type"],
        },
        {
          fields: ["resource_id"],
        },
        {
          fields: ["createdAt"],
        },
        {
          fields: ["status"],
        },
      ],
    }
  );

  return AuditTrail;
};

