const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Testimony = sequelize.define(
    "Testimony",
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
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 5,
        },
        comment: "Rating from 1 to 5 stars",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        defaultValue: "pending",
      },
    },
    {
      tableName: "testimonies",
      timestamps: true,
      getterMethods: {
        stars() {
          const rating = this.getDataValue('rating');
          return '⭐'.repeat(rating);
        }
      }
    }
  );

  return Testimony;
};
