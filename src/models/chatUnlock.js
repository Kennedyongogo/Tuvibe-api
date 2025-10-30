const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ChatUnlock = sequelize.define(
    "ChatUnlock",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      public_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "public_users", key: "id" },
        comment: "User initiating chat",
      },
      target_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "public_users", key: "id" },
        comment: "User being contacted",
      },
      token_cost: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("success", "failed"),
        allowNull: false,
      },
    },
    {
      tableName: "chat_unlocks",
      timestamps: true,
      updatedAt: false,
    }
  );

  return ChatUnlock;
};
