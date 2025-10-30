const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AdminUser = sequelize.define(
    "AdminUser",
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
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM("superadmin", "moderator"),
        allowNull: false,
        defaultValue: "moderator",
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "admin_users",
      timestamps: true,
    }
  );

  return AdminUser;
};
