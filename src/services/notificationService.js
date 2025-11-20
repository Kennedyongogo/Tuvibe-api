const { Op } = require("sequelize");
const { Notification } = require("../models");

// Clean up old notifications
// Default: Delete read notifications older than 30 days and unread notifications older than 90 days
exports.cleanupOldNotifications = async (
  readNotificationRetentionDays = 30,
  unreadNotificationRetentionDays = 90
) => {
  try {
    const now = new Date();

    // Delete read notifications older than readNotificationRetentionDays
    const readNotificationCutoff = new Date(now);
    readNotificationCutoff.setDate(
      readNotificationCutoff.getDate() - readNotificationRetentionDays
    );

    // Delete unread notifications older than unreadNotificationRetentionDays
    const unreadNotificationCutoff = new Date(now);
    unreadNotificationCutoff.setDate(
      unreadNotificationCutoff.getDate() - unreadNotificationRetentionDays
    );

    // Delete old read notifications
    const deletedReadNotifications = await Notification.destroy({
      where: {
        isRead: true,
        createdAt: { [Op.lt]: readNotificationCutoff },
      },
    });

    // Delete old unread notifications
    const deletedUnreadNotifications = await Notification.destroy({
      where: {
        isRead: false,
        createdAt: { [Op.lt]: unreadNotificationCutoff },
      },
    });

    const totalDeleted = deletedReadNotifications + deletedUnreadNotifications;

    if (totalDeleted > 0) {
      console.log(
        `[Notification Cleanup] Deleted ${totalDeleted} old notifications (${deletedReadNotifications} read notifications older than ${readNotificationRetentionDays} days, ${deletedUnreadNotifications} unread notifications older than ${unreadNotificationRetentionDays} days)`
      );
    }

    return {
      deletedReadNotifications,
      deletedUnreadNotifications,
      totalDeleted,
    };
  } catch (err) {
    console.error("[Notification Cleanup] Error:", err);
    throw err;
  }
};

// Get notification statistics
exports.getNotificationStats = async (userId) => {
  try {
    const total = await Notification.count({
      where: { public_user_id: userId },
    });

    const unread = await Notification.count({
      where: {
        public_user_id: userId,
        isRead: false,
      },
    });

    const read = await Notification.count({
      where: {
        public_user_id: userId,
        isRead: true,
      },
    });

    return {
      total,
      unread,
      read,
    };
  } catch (err) {
    console.error("[Notification Service] Error getting stats:", err);
    throw err;
  }
};
