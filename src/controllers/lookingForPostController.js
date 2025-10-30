const { LookingForPost } = require("../models");

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

exports.create = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content)
      return res
        .status(400)
        .json({ success: false, message: "content required" });
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
