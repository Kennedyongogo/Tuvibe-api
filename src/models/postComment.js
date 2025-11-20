const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PostComment = sequelize.define(
    "PostComment",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      post_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "posts",
          key: "id",
        },
        field: "post_id",
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "public_users",
          key: "id",
        },
        field: "user_id",
      },
      parent_comment_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "post_comments",
          key: "id",
        },
        field: "parent_comment_id",
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_edited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "is_edited",
      },
      reaction_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: "reaction_count",
      },
    },
    {
      tableName: "post_comments",
      timestamps: true,
      indexes: [
        {
          fields: ["post_id"],
        },
        {
          fields: ["user_id"],
        },
        {
          fields: ["parent_comment_id"],
        },
      ],
    }
  );

  return PostComment;
};
