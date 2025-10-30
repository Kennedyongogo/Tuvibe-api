const { MarketItem, AdminUser } = require("../models");

exports.list = async (req, res) => {
  try {
    const where = {};
    const { tag } = req.query;
    if (tag) where.tag = tag;
    const rows = await MarketItem.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("market list error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list items" });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      image,
      whatsapp_number,
      is_featured,
      tag,
    } = req.body;
    if (!title || !price)
      return res
        .status(400)
        .json({ success: false, message: "title and price required" });
    const row = await MarketItem.create({
      title,
      description,
      price,
      image,
      whatsapp_number,
      is_featured: !!is_featured,
      created_by: req.userId,
      tag: tag || "none",
    });
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error("market create error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create item" });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await MarketItem.findByPk(id);
    if (!row)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    const allowed = [
      "title",
      "description",
      "price",
      "image",
      "whatsapp_number",
      "is_featured",
      "tag",
    ];
    const updates = {};
    for (const k of allowed)
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    await row.update(updates);
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error("market update error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update item" });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await MarketItem.findByPk(id);
    if (!row)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    await row.destroy();
    return res.json({ success: true });
  } catch (err) {
    console.error("market delete error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete item" });
  }
};
