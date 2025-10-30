const { Notification } = require("../models");

exports.listMine = async (req, res) => {
  try {
    const rows = await Notification.findAll({
      where: { public_user_id: req.publicUserId },
      order: [["createdAt", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("notifications listMine error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list notifications" });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await Notification.findByPk(id);
    if (!row || row.public_user_id !== req.publicUserId)
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    await row.update({ isRead: true });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error("notifications markRead error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to mark read" });
  }
};

exports.adminCreate = async (req, res) => {
  try {
    const { public_user_id, title, message } = req.body;
    if (!public_user_id || !title || !message)
      return res.status(400).json({
        success: false,
        message: "public_user_id, title, message required",
      });
    const row = await Notification.create({ public_user_id, title, message });
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error("notifications adminCreate error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create notification" });
  }
};
