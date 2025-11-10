const { MarketItem, AdminUser } = require("../models");
const { Sequelize } = require("sequelize");
const path = require("path");
const { validatePhoneNumber } = require("../utils/phone");

exports.list = async (req, res) => {
  try {
    const where = {};
    const { tag } = req.query;

    // Normalize tag filter to internal enum values
    const normalizeTag = (value) => {
      if (!value) return null;
      const v = String(value).toLowerCase().replace(/[-\s]/g, "_");
      if (
        v === "hot_deals" ||
        v === "hot" ||
        v === "hotdeal" ||
        v === "hot_deal"
      )
        return "hot_deals";
      if (
        v === "weekend_picks" ||
        v === "weekend" ||
        v === "weekendpick" ||
        v === "weekend_pick"
      )
        return "weekend_picks";
      if (v === "none") return "none";
      return null;
    };

    const normalizedTag = normalizeTag(tag);
    if (normalizedTag) {
      where.tag = normalizedTag;
    }

    const rows = await MarketItem.findAll({
      where,
      order: [
        ["is_featured", "DESC"],
        [
          Sequelize.literal(
            "CASE WHEN tag='hot_deals' THEN 0 WHEN tag='weekend_picks' THEN 1 ELSE 2 END"
          ),
          "ASC",
        ],
        ["createdAt", "DESC"],
      ],
    });

    const data = rows.map((r) => {
      const item = r.toJSON();
      item.tag_label =
        item.tag === "hot_deals"
          ? "Hot Deals"
          : item.tag === "weekend_picks"
          ? "Weekend Picks"
          : null;
      return item;
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error("market list error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to list items" });
  }
};

exports.create = async (req, res) => {
  try {
    const { title, description, price, whatsapp_number, is_featured, tag } =
      req.body;
    if (!title || !price)
      return res
        .status(400)
        .json({ success: false, message: "title and price required" });

    let normalizedWhatsapp = null;
    if (
      whatsapp_number !== undefined &&
      whatsapp_number !== null &&
      whatsapp_number !== ""
    ) {
      const {
        valid,
        normalized,
        message: phoneValidationMessage,
      } = validatePhoneNumber(whatsapp_number);

      if (!valid) {
        return res.status(400).json({
          success: false,
          message: phoneValidationMessage,
        });
      }

      normalizedWhatsapp = normalized;
    }

    // Handle multiple images upload
    let imagesArray = [];
    if (req.files && req.files.length > 0) {
      imagesArray = req.files.map((file) => `market/${file.filename}`);
    }

    const row = await MarketItem.create({
      title,
      description,
      price,
      images: imagesArray,
      whatsapp_number: normalizedWhatsapp,
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
      "whatsapp_number",
      "is_featured",
      "tag",
      "images",
    ];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        // Handle images array - ensure it's properly formatted
        if (k === "images") {
          if (Array.isArray(req.body[k])) {
            updates[k] = req.body[k];
          } else if (typeof req.body[k] === "string") {
            // Try to parse JSON string from FormData
            try {
              const parsed = JSON.parse(req.body[k]);
              updates[k] = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              updates[k] = [];
            }
          } else {
            updates[k] = [];
          }
        } else if (k === "whatsapp_number") {
          const rawWhatsapp = req.body[k];

          if (
            rawWhatsapp === undefined ||
            rawWhatsapp === null ||
            rawWhatsapp === ""
          ) {
            updates.whatsapp_number = null;
          } else {
            const {
              valid,
              normalized,
              message: phoneValidationMessage,
            } = validatePhoneNumber(rawWhatsapp);

            if (!valid) {
              return res.status(400).json({
                success: false,
                message: phoneValidationMessage,
              });
            }

            updates.whatsapp_number = normalized;
          }
        } else {
          updates[k] = req.body[k];
        }
      }
    }

    const fs = require("fs");

    // Handle multiple images upload
    if (req.files && req.files.length > 0) {
      // Delete old images if they exist
      if (row.images && Array.isArray(row.images)) {
        row.images.forEach((oldImagePath) => {
          if (oldImagePath) {
            const fullPath = path.join(
              __dirname,
              "..",
              "..",
              "uploads",
              oldImagePath
            );
            if (fs.existsSync(fullPath)) {
              try {
                fs.unlinkSync(fullPath);
              } catch (err) {
                console.error("Error deleting old image:", err);
              }
            }
          }
        });
      }
      // Set new images array
      updates.images = req.files.map((file) => `market/${file.filename}`);
    }

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

    // Delete associated image files
    const fs = require("fs");

    // Delete images
    if (row.images && Array.isArray(row.images)) {
      row.images.forEach((imagePath) => {
        if (imagePath) {
          const fullPath = path.join(
            __dirname,
            "..",
            "..",
            "uploads",
            imagePath
          );
          if (fs.existsSync(fullPath)) {
            try {
              fs.unlinkSync(fullPath);
            } catch (err) {
              console.error("Error deleting image:", err);
            }
          }
        }
      });
    }

    await row.destroy();
    return res.json({ success: true });
  } catch (err) {
    console.error("market delete error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete item" });
  }
};
