const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const RatingTestimonial = sequelize.define(
    "RatingTestimonial",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      public_user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: "public_users", key: "id" },
        onDelete: "CASCADE",
        comment: "User who submitted the rating/testimonial",
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 5,
          isInt: true,
        },
        comment: "Rating from 1 to 5 stars",
      },
      testimonial: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Optional testimonial text",
      },
      is_approved: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Whether the testimonial is approved for public display",
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "When the testimonial was approved",
      },
    },
    {
      tableName: "rating_testimonials",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["public_user_id"],
        },
        {
          fields: ["is_approved"],
        },
        {
          fields: ["rating"],
        },
      ],
    }
  );

  return RatingTestimonial;
};
