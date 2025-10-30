const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const LookingForPost = sequelize.define(
    "LookingForPost",
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
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      tableName: "looking_for_posts",
      timestamps: true,
      updatedAt: false,
    }
  );

  return LookingForPost;
};
