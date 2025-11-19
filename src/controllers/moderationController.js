const { PublicUser, Notification } = require("../models");
const { Op } = require("sequelize");
const { sendEventToUser } = require("../routes/sseRoutes");
const { formatUserForResponse } = require("../utils/userProfile");

// Get pending moderation items (photos and bios)
exports.getPending = async (req, res) => {
  try {
    const { type, page = 1, pageSize = 20 } = req.query;

    const where = {};

    // Filter by type (photo or bio)
    if (type === "photo") {
      where.photo_moderation_status = "pending";
      where.photo = { [Op.ne]: null };
    } else if (type === "bio") {
      where.bio_moderation_status = "pending";
      where.bio = { [Op.ne]: null, [Op.ne]: "" };
    } else {
      // Both pending photos and bios
      where[Op.or] = [
        { photo_moderation_status: "pending", photo: { [Op.ne]: null } },
        {
          bio_moderation_status: "pending",
          bio: { [Op.ne]: null, [Op.ne]: "" },
        },
      ];
    }

    const limit = Math.min(Number(pageSize) || 20, 50);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await PublicUser.findAndCountAll({
      where,
      attributes: {
        exclude: ["password", "otp"],
      },
      order: [["updatedAt", "DESC"]],
      limit,
      offset,
    });

    // Format response to show what needs moderation
    const formatted = rows.map((user) => {
      const data = user.toJSON();
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        photo: data.photo,
        photo_moderation_status: data.photo_moderation_status,
        bio: data.bio,
        bio_moderation_status: data.bio_moderation_status,
        updatedAt: data.updatedAt,
      };
    });

    return res.json({
      success: true,
      data: formatted,
      pagination: {
        total: count,
        page: Number(page),
        pageSize: limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("getPending moderation error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch pending items" });
  }
};

// Approve photo
exports.approvePhoto = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;

    const user = await PublicUser.findByPk(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.photo) {
      return res
        .status(400)
        .json({ success: false, message: "User has no photo to approve" });
    }

    await user.update({
      photo_moderation_status: "approved",
    });

    // Reload user to get latest data
    const updatedUser = await PublicUser.findByPk(userId, {
      attributes: { exclude: ["password", "otp"] },
    });

    // Create notification for user
    try {
      await Notification.create({
        public_user_id: userId,
        title: "Profile Photo Approved",
        message:
          "Your profile photo has been approved and is now visible to others.",
        isRead: false,
      });
    } catch (notifErr) {
      console.error("Failed to create notification:", notifErr);
      // Don't fail the request if notification fails
    }

    // Send SSE event to notify user's frontend of the update
    try {
      sendEventToUser(
        userId,
        "user:update",
        formatUserForResponse(updatedUser)
      );
    } catch (sseErr) {
      console.error(
        "[SSE] Error sending user:update event for photo approval:",
        sseErr
      );
    }

    return res.json({
      success: true,
      message: "Photo approved successfully",
      data: {
        id: updatedUser.id,
        photo: updatedUser.photo,
        photo_moderation_status: "approved",
      },
    });
  } catch (err) {
    console.error("approvePhoto error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to approve photo" });
  }
};

// Reject photo
exports.rejectPhoto = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;

    const user = await PublicUser.findByPk(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await user.update({
      photo_moderation_status: "rejected",
    });

    // Reload user to get latest data
    const updatedUser = await PublicUser.findByPk(userId, {
      attributes: { exclude: ["password", "otp"] },
    });

    // Create notification for user
    try {
      await Notification.create({
        public_user_id: userId,
        title: "Profile Photo Rejected",
        message:
          notes ||
          "Your profile photo has been rejected. Please upload an appropriate photo.",
        isRead: false,
      });
    } catch (notifErr) {
      console.error("Failed to create notification:", notifErr);
    }

    // Send SSE event to notify user's frontend of the update
    try {
      sendEventToUser(
        userId,
        "user:update",
        formatUserForResponse(updatedUser)
      );
    } catch (sseErr) {
      console.error(
        "[SSE] Error sending user:update event for photo rejection:",
        sseErr
      );
    }

    return res.json({
      success: true,
      message: "Photo rejected successfully",
      data: {
        id: updatedUser.id,
        photo_moderation_status: "rejected",
      },
    });
  } catch (err) {
    console.error("rejectPhoto error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reject photo" });
  }
};

// Approve bio
exports.approveBio = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await PublicUser.findByPk(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.bio || user.bio.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "User has no bio to approve" });
    }

    await user.update({
      bio_moderation_status: "approved",
    });

    // Reload user to get latest data
    const updatedUser = await PublicUser.findByPk(userId, {
      attributes: { exclude: ["password", "otp"] },
    });

    // Create notification for user
    try {
      await Notification.create({
        public_user_id: userId,
        title: "Bio Approved",
        message: "Your bio has been approved and is now visible to others.",
        isRead: false,
      });
    } catch (notifErr) {
      console.error("Failed to create notification:", notifErr);
    }

    // Send SSE event to notify user's frontend of the update
    try {
      sendEventToUser(
        userId,
        "user:update",
        formatUserForResponse(updatedUser)
      );
    } catch (sseErr) {
      console.error(
        "[SSE] Error sending user:update event for bio approval:",
        sseErr
      );
    }

    return res.json({
      success: true,
      message: "Bio approved successfully",
      data: {
        id: updatedUser.id,
        bio: updatedUser.bio,
        bio_moderation_status: "approved",
      },
    });
  } catch (err) {
    console.error("approveBio error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to approve bio" });
  }
};

// Reject bio
exports.rejectBio = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;

    const user = await PublicUser.findByPk(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await user.update({
      bio_moderation_status: "rejected",
    });

    // Reload user to get latest data
    const updatedUser = await PublicUser.findByPk(userId, {
      attributes: { exclude: ["password", "otp"] },
    });

    // Create notification for user
    try {
      await Notification.create({
        public_user_id: userId,
        title: "Bio Rejected",
        message:
          notes ||
          "Your bio has been rejected. Please write an appropriate bio.",
        isRead: false,
      });
    } catch (notifErr) {
      console.error("Failed to create notification:", notifErr);
    }

    // Send SSE event to notify user's frontend of the update
    try {
      sendEventToUser(
        userId,
        "user:update",
        formatUserForResponse(updatedUser)
      );
    } catch (sseErr) {
      console.error(
        "[SSE] Error sending user:update event for bio rejection:",
        sseErr
      );
    }

    return res.json({
      success: true,
      message: "Bio rejected successfully",
      data: {
        id: updatedUser.id,
        bio_moderation_status: "rejected",
      },
    });
  } catch (err) {
    console.error("rejectBio error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reject bio" });
  }
};

// Bulk approve photos
exports.bulkApprovePhotos = async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "userIds array required" });
    }

    const [updatedCount] = await PublicUser.update(
      { photo_moderation_status: "approved" },
      {
        where: {
          id: { [Op.in]: userIds },
          photo: { [Op.ne]: null },
          photo_moderation_status: "pending",
        },
      }
    );

    // Reload updated users to get latest data for SSE events
    const updatedUsers = await PublicUser.findAll({
      where: {
        id: { [Op.in]: userIds },
      },
      attributes: { exclude: ["password", "otp"] },
    });

    // Create notifications for all users
    try {
      const notifications = userIds.map((userId) => ({
        public_user_id: userId,
        title: "Profile Photo Approved",
        message:
          "Your profile photo has been approved and is now visible to others.",
        isRead: false,
      }));
      await Notification.bulkCreate(notifications);
    } catch (notifErr) {
      console.error("Failed to create notifications:", notifErr);
    }

    // Send SSE events to notify users' frontends of the update
    try {
      updatedUsers.forEach((user) => {
        sendEventToUser(user.id, "user:update", formatUserForResponse(user));
      });
    } catch (sseErr) {
      console.error(
        "[SSE] Error sending user:update events for bulk photo approval:",
        sseErr
      );
    }

    return res.json({
      success: true,
      message: `Approved ${updatedCount} photos`,
      data: { count: updatedCount },
    });
  } catch (err) {
    console.error("bulkApprovePhotos error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to bulk approve photos" });
  }
};

// Bulk approve bios
exports.bulkApproveBios = async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "userIds array required" });
    }

    const [updatedCount] = await PublicUser.update(
      { bio_moderation_status: "approved" },
      {
        where: {
          id: { [Op.in]: userIds },
          bio: { [Op.ne]: null, [Op.ne]: "" },
          bio_moderation_status: "pending",
        },
      }
    );

    // Reload updated users to get latest data for SSE events
    const updatedUsers = await PublicUser.findAll({
      where: {
        id: { [Op.in]: userIds },
      },
      attributes: { exclude: ["password", "otp"] },
    });

    // Create notifications for all users
    try {
      const notifications = userIds.map((userId) => ({
        public_user_id: userId,
        title: "Bio Approved",
        message: "Your bio has been approved and is now visible to others.",
        isRead: false,
      }));
      await Notification.bulkCreate(notifications);
    } catch (notifErr) {
      console.error("Failed to create notifications:", notifErr);
    }

    // Send SSE events to notify users' frontends of the update
    try {
      updatedUsers.forEach((user) => {
        sendEventToUser(user.id, "user:update", formatUserForResponse(user));
      });
    } catch (sseErr) {
      console.error(
        "[SSE] Error sending user:update events for bulk bio approval:",
        sseErr
      );
    }

    return res.json({
      success: true,
      message: `Approved ${updatedCount} bios`,
      data: { count: updatedCount },
    });
  } catch (err) {
    console.error("bulkApproveBios error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to bulk approve bios" });
  }
};

// Approve gallery photo (from photos array)
exports.approveGalleryPhoto = async (req, res) => {
  try {
    const { userId, photoIndex } = req.params;
    const { notes } = req.body;

    const user = await PublicUser.findByPk(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.photos || !Array.isArray(user.photos)) {
      return res
        .status(400)
        .json({ success: false, message: "User has no gallery photos" });
    }

    const index = parseInt(photoIndex);
    if (isNaN(index) || index < 0 || index >= user.photos.length) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid photo index" });
    }

    // Update the specific photo's moderation status
    const updatedPhotos = [...user.photos];
    updatedPhotos[index] = {
      ...updatedPhotos[index],
      moderation_status: "approved",
    };

    await user.update({ photos: updatedPhotos });

    // Reload user to get latest data
    const updatedUser = await PublicUser.findByPk(userId, {
      attributes: { exclude: ["password", "otp"] },
    });

    // Create notification for user
    try {
      await Notification.create({
        public_user_id: userId,
        title: "Gallery Photo Approved",
        message:
          "Your gallery photo has been approved and is now visible to others.",
        isRead: false,
      });
    } catch (notifErr) {
      console.error("Failed to create notification:", notifErr);
    }

    // Send SSE event to notify user's frontend of the update
    try {
      sendEventToUser(
        userId,
        "user:update",
        formatUserForResponse(updatedUser)
      );
    } catch (sseErr) {
      console.error(
        "[SSE] Error sending user:update event for gallery photo approval:",
        sseErr
      );
    }

    return res.json({
      success: true,
      message: "Gallery photo approved successfully",
      data: {
        id: updatedUser.id,
        photos: updatedUser.photos,
      },
    });
  } catch (err) {
    console.error("approveGalleryPhoto error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to approve gallery photo" });
  }
};

// Reject gallery photo (from photos array)
exports.rejectGalleryPhoto = async (req, res) => {
  try {
    const { userId, photoIndex } = req.params;
    const { notes } = req.body;

    const user = await PublicUser.findByPk(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.photos || !Array.isArray(user.photos)) {
      return res
        .status(400)
        .json({ success: false, message: "User has no gallery photos" });
    }

    const index = parseInt(photoIndex);
    if (isNaN(index) || index < 0 || index >= user.photos.length) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid photo index" });
    }

    // Update the specific photo's moderation status
    const updatedPhotos = [...user.photos];
    updatedPhotos[index] = {
      ...updatedPhotos[index],
      moderation_status: "rejected",
    };

    await user.update({ photos: updatedPhotos });

    // Reload user to get latest data
    const updatedUser = await PublicUser.findByPk(userId, {
      attributes: { exclude: ["password", "otp"] },
    });

    // Create notification for user
    try {
      await Notification.create({
        public_user_id: userId,
        title: "Gallery Photo Rejected",
        message:
          notes ||
          "Your gallery photo has been rejected. Please upload an appropriate photo.",
        isRead: false,
      });
    } catch (notifErr) {
      console.error("Failed to create notification:", notifErr);
    }

    // Send SSE event to notify user's frontend of the update
    try {
      sendEventToUser(
        userId,
        "user:update",
        formatUserForResponse(updatedUser)
      );
    } catch (sseErr) {
      console.error(
        "[SSE] Error sending user:update event for gallery photo rejection:",
        sseErr
      );
    }

    return res.json({
      success: true,
      message: "Gallery photo rejected successfully",
      data: {
        id: updatedUser.id,
        photos: updatedUser.photos,
      },
    });
  } catch (err) {
    console.error("rejectGalleryPhoto error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reject gallery photo" });
  }
};
