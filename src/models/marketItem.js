const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const MarketItem = sequelize.define(
    "MarketItem",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      image: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      whatsapp_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_featured: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "admin_users", key: "id" },
      },
    },
    {
      tableName: "market_items",
      timestamps: true,
      updatedAt: false,
    }
  );

  return MarketItem;
};
