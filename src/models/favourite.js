const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Favourite = sequelize.define(
    "Favourite",
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
        comment: "Who favourited",
      },
      favourite_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "public_users", key: "id" },
        comment: "Who was favourited",
      },
    },
    {
      tableName: "favourites",
      timestamps: true,
      updatedAt: false,
    }
  );

  return Favourite;
};
