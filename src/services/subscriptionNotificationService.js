const { Op } = require("sequelize");
const { Subscription, Notification, PublicUser } = require("../models");
const { sendEventToUser } = require("../routes/sseRoutes");

/**
 * Check for subscriptions expiring soon and send notifications
 * @param {number} daysBeforeExpiry - Number of days before expiry to check (e.g., 7, 3, 1)
 * @returns {Promise<Object>} - Statistics about notifications sent
 */
const checkAndNotifyExpiringSubscriptions = async (daysBeforeExpiry = 7) => {
  try {
    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);

    // Start of target day
    const startOfTargetDay = new Date(targetDate);
    startOfTargetDay.setHours(0, 0, 0, 0);

    // End of target day
    const endOfTargetDay = new Date(targetDate);
    endOfTargetDay.setHours(23, 59, 59, 999);

    // Find active subscriptions expiring on the target date
    const expiringSubscriptions = await Subscription.findAll({
      where: {
        status: "active",
        expires_at: {
          [Op.gte]: startOfTargetDay,
          [Op.lte]: endOfTargetDay,
        },
      },
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (expiringSubscriptions.length === 0) {
      return {
        checked: true,
        notificationsSent: 0,
        daysBeforeExpiry,
      };
    }

    let notificationsSent = 0;
    const notificationPromises = [];

    for (const subscription of expiringSubscriptions) {
      // Check if notification already exists for this subscription and expiry date today
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      const existingNotification = await Notification.findOne({
        where: {
          public_user_id: subscription.public_user_id,
          title: {
            [Op.like]: `%Subscription Expiring%`,
          },
          message: {
            [Op.like]: `%${subscription.plan}%`,
          },
          createdAt: {
            [Op.gte]: startOfToday,
          },
        },
      });

      // Only send notification if one hasn't been sent today for this subscription
      if (!existingNotification) {
        const remainingDays = Math.ceil(
          (new Date(subscription.expires_at).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24)
        );

        const title =
          daysBeforeExpiry === 0
            ? "Subscription Expired"
            : `Subscription Expiring in ${remainingDays} ${
                remainingDays === 1 ? "Day" : "Days"
              }`;

        const message =
          daysBeforeExpiry === 0
            ? `Your ${subscription.plan} subscription has expired. Please renew to continue enjoying all premium features.`
            : `Your ${
                subscription.plan
              } subscription will expire in ${remainingDays} ${
                remainingDays === 1 ? "day" : "days"
              }. Renew now to avoid interruption of service.`;

        notificationPromises.push(
          Notification.create({
            public_user_id: subscription.public_user_id,
            title,
            message,
            isRead: false,
          })
        );
        notificationsSent++;
      }
    }

    await Promise.all(notificationPromises);

    console.log(
      `[Subscription Notifications] Sent ${notificationsSent} notifications for subscriptions expiring in ${daysBeforeExpiry} days`
    );

    return {
      checked: true,
      notificationsSent,
      daysBeforeExpiry,
      subscriptionsFound: expiringSubscriptions.length,
    };
  } catch (err) {
    console.error(
      "[Subscription Notifications] Error checking expiring subscriptions:",
      err
    );
    throw err;
  }
};

/**
 * Check for expired subscriptions and send notifications
 * Also update subscription status to "expired"
 */
const checkAndNotifyExpiredSubscriptions = async () => {
  try {
    const now = new Date();

    // Find subscriptions that have expired but are still marked as "active"
    const expiredSubscriptions = await Subscription.findAll({
      where: {
        status: "active",
        expires_at: {
          [Op.lt]: now,
        },
      },
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (expiredSubscriptions.length === 0) {
      return {
        checked: true,
        notificationsSent: 0,
        subscriptionsUpdated: 0,
      };
    }

    let notificationsSent = 0;
    let subscriptionsUpdated = 0;
    const notificationPromises = [];
    const updatePromises = [];

    for (const subscription of expiredSubscriptions) {
      // Update subscription status to "expired"
      updatePromises.push(
        subscription
          .update({
            status: "expired",
          })
          .then(async () => {
            // Send SSE event for subscription expiration
            try {
              await subscription.reload();
              sendEventToUser(
                subscription.public_user_id,
                "subscription:expired",
                {
                  subscription: subscription.toJSON(),
                }
              );
            } catch (sseError) {
              console.error(
                "[SSE] Error sending subscription:expired event:",
                sseError
              );
            }
          })
      );
      subscriptionsUpdated++;

      // Check if notification already exists for this expired subscription today
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      const existingNotification = await Notification.findOne({
        where: {
          public_user_id: subscription.public_user_id,
          title: "Subscription Expired",
          message: {
            [Op.like]: `%${subscription.plan}%`,
          },
          createdAt: {
            [Op.gte]: startOfToday,
          },
        },
      });

      // Only send notification if one hasn't been sent today
      if (!existingNotification) {
        notificationPromises.push(
          Notification.create({
            public_user_id: subscription.public_user_id,
            title: "Subscription Expired",
            message: `Your ${subscription.plan} subscription has expired. Please renew to continue enjoying all premium features.`,
            isRead: false,
          })
        );
        notificationsSent++;
      }
    }

    await Promise.all([...notificationPromises, ...updatePromises]);

    console.log(
      `[Subscription Notifications] Updated ${subscriptionsUpdated} expired subscriptions and sent ${notificationsSent} notifications`
    );

    return {
      checked: true,
      notificationsSent,
      subscriptionsUpdated,
    };
  } catch (err) {
    console.error(
      "[Subscription Notifications] Error checking expired subscriptions:",
      err
    );
    throw err;
  }
};

/**
 * Run all subscription expiration checks
 * This should be called daily (e.g., via cron job)
 */
const runSubscriptionExpirationChecks = async () => {
  try {
    console.log("[Subscription Notifications] Starting expiration checks...");

    const results = {
      expired: await checkAndNotifyExpiredSubscriptions(),
      sevenDays: await checkAndNotifyExpiringSubscriptions(7),
      threeDays: await checkAndNotifyExpiringSubscriptions(3),
      oneDay: await checkAndNotifyExpiringSubscriptions(1),
    };

    console.log(
      "[Subscription Notifications] Expiration checks completed:",
      results
    );

    return results;
  } catch (err) {
    console.error(
      "[Subscription Notifications] Error running expiration checks:",
      err
    );
    throw err;
  }
};

module.exports = {
  checkAndNotifyExpiringSubscriptions,
  checkAndNotifyExpiredSubscriptions,
  runSubscriptionExpirationChecks,
};
