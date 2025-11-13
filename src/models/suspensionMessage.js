const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const SuspensionMessage = sequelize.define(
    "SuspensionMessage",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      suspension_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      sender_role: {
        type: DataTypes.ENUM("admin", "user"),
        allowNull: false,
      },
      sender_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      read_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "suspension_messages",
      timestamps: true,
      indexes: [
        {
          fields: ["suspension_id", "is_read"],
        },
      ],
    }
  );

  return SuspensionMessage;
};
