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
      gender: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      age: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      city: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      category: {
        type: DataTypes.ENUM("Regular", "Sugar Mummy", "Sponsor", "Ben 10"),
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
        allowNull: false,
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      photo: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      token_balance: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      otp: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      otp_expiry: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "public_users",
      timestamps: true,
    }
  );

  return PublicUser;
};
