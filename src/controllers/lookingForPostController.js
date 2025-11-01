const { LookingForPost, PublicUser } = require("../models");
const { Op } = require("sequelize");

exports.listMine = async (req, res) => {
  try {
    const rows = await LookingForPost.findAll({
      where: { public_user_id: req.publicUserId },
      order: [["createdAt", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("posts listMine error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list posts" });
  }
};

// Fetch posts for multiple users (for Premium Lounge display)
exports.listByUserIds = async (req, res) => {
  try {
    const { user_ids } = req.query;
    
    if (!user_ids) {
      return res.json({ success: true, data: [] });
    }

    // Parse user_ids from query string (comma-separated)
    const userIdArray = Array.isArray(user_ids) 
      ? user_ids 
      : user_ids.split(',').filter(id => id.trim());

    if (userIdArray.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch latest post for each user
    const rows = await LookingForPost.findAll({
      where: {
        public_user_id: { [Op.in]: userIdArray }
      },
      include: [
        {
          model: PublicUser,
          as: "author",
          attributes: ["id", "name", "photo", "category"],
        }
      ],
      order: [["createdAt", "DESC"]],
    });

    // Group by user_id and get latest post for each user
    const postsByUser = {};
    rows.forEach(post => {
      const userId = post.public_user_id;
      if (!postsByUser[userId] || new Date(post.createdAt) > new Date(postsByUser[userId].createdAt)) {
        postsByUser[userId] = post.toJSON();
      }
    });

    return res.json({ 
      success: true, 
      data: Object.values(postsByUser) 
    });
  } catch (err) {
    console.error("posts listByUserIds error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch posts" });
  }
};

exports.create = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content)
      return res
        .status(400)
        .json({ success: false, message: "content required" });
    
    // Check if user is verified premium user
    const user = await PublicUser.findByPk(req.publicUserId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const premiumCategories = ["Sugar Mummy", "Sponsor", "Ben 10"];
    const isPremiumCategory = premiumCategories.includes(user.category);
    
    if (!isPremiumCategory || !user.isVerified) {
      return res
        .status(403)
        .json({ 
          success: false, 
          message: "Only verified premium users can create 'Looking For' posts" 
        });
    }

    const row = await LookingForPost.create({
      public_user_id: req.publicUserId,
      content,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error("posts create error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create post" });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await LookingForPost.findByPk(id);
    if (!row || row.public_user_id !== req.publicUserId) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }
    await row.update({ content: req.body.content ?? row.content });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error("posts update error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update post" });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await LookingForPost.findByPk(id);
    if (!row || row.public_user_id !== req.publicUserId) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }
    await row.destroy();
    return res.json({ success: true });
  } catch (err) {
    console.error("posts delete error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete post" });
  }
};
