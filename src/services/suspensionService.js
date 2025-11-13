const { Op } = require("sequelize");
const {
  AccountSuspension,
  SuspensionMessage,
  PublicUser,
  AdminUser,
  sequelize,
} = require("../models");
const {
  emitSuspensionStatus,
  emitSuspensionRevoked,
  emitSuspensionMessage,
  emitSuspensionReadReceipt,
  emitAdminDashboardUpdate,
} = require("../sockets/suspensionEmitter");

const ACTIVE_STATUS = "active";
const REVOKED_STATUS = "revoked";

const formatSuspension = (suspensionInstance) =>
  suspensionInstance?.get({ plain: true }) || null;

exports.suspendAccount = async ({
  publicUserId,
  adminUserId,
  reason,
  metadata = {},
}) => {
  return sequelize.transaction(async (transaction) => {
    const user = await PublicUser.findByPk(publicUserId, { transaction });
    if (!user) {
      const error = new Error("Public user not found");
      error.statusCode = 404;
      throw error;
    }

    if (adminUserId) {
      const admin = await AdminUser.findByPk(adminUserId, { transaction });
      if (!admin) {
        const error = new Error("Admin user not found");
        error.statusCode = 404;
        throw error;
      }
    }

    let suspension = await AccountSuspension.findOne({
      where: {
        public_user_id: publicUserId,
        status: ACTIVE_STATUS,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const now = new Date();

    if (suspension) {
      suspension.set({
        reason: reason ?? suspension.reason,
        admin_user_id: adminUserId || suspension.admin_user_id,
        metadata: {
          ...(suspension.metadata || {}),
          ...(metadata || {}),
          updated_at: now.toISOString(),
        },
      });
      await suspension.save({ transaction });
      const plain = formatSuspension(suspension);
      transaction.afterCommit(() => {
        emitSuspensionStatus(plain);
        emitAdminDashboardUpdate({
          type: "suspension_updated",
          suspension: plain,
        });
      });
      return {
        suspension: plain,
        created: false,
      };
    }

    suspension = await AccountSuspension.create(
      {
        public_user_id: publicUserId,
        admin_user_id: adminUserId,
        status: ACTIVE_STATUS,
        reason,
        metadata: {
          ...(metadata || {}),
          created_at: now.toISOString(),
        },
      },
      { transaction }
    );

    const plain = formatSuspension(suspension);
    transaction.afterCommit(() => {
      emitSuspensionStatus(plain);
      emitAdminDashboardUpdate({
        type: "suspension_created",
        suspension: plain,
      });
    });

    return { suspension: plain, created: true };
  });
};

exports.revokeSuspension = async ({ suspensionId, adminUserId }) => {
  return sequelize.transaction(async (transaction) => {
    const suspension = await AccountSuspension.findByPk(suspensionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!suspension) {
      const error = new Error("Suspension not found");
      error.statusCode = 404;
      throw error;
    }

    if (suspension.status === REVOKED_STATUS) {
      return formatSuspension(suspension);
    }

    suspension.set({
      status: REVOKED_STATUS,
      revoked_at: new Date(),
      admin_user_id: adminUserId || suspension.admin_user_id,
    });

    await suspension.save({ transaction });

    await SuspensionMessage.destroy({
      where: { suspension_id: suspensionId },
      transaction,
    });

    const plain = formatSuspension(suspension);
    transaction.afterCommit(() => {
      emitSuspensionRevoked(plain);
      emitAdminDashboardUpdate({
        type: "suspension_revoked",
        suspension: plain,
      });
    });

    return plain;
  });
};

exports.getActiveSuspensionForUser = async (publicUserId) => {
  const suspension = await AccountSuspension.findOne({
    where: {
      public_user_id: publicUserId,
      status: ACTIVE_STATUS,
    },
  });
  return formatSuspension(suspension);
};

exports.getSuspensionById = async (suspensionId, includeMessages = false) => {
  const include = includeMessages
    ? [
        {
          model: SuspensionMessage,
          as: "messages",
          separate: true,
          order: [["createdAt", "ASC"]],
        },
      ]
    : undefined;

  const suspension = await AccountSuspension.findByPk(suspensionId, {
    include,
  });
  return formatSuspension(suspension);
};

exports.listSuspensions = async ({
  status,
  limit = 50,
  offset = 0,
  publicUserId,
}) => {
  const where = {};
  if (status) {
    where.status = status;
  }
  if (publicUserId) {
    where.public_user_id = publicUserId;
  }

  const { rows, count } = await AccountSuspension.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  return {
    count,
    rows: rows.map((item) => formatSuspension(item)),
  };
};

exports.createSuspensionMessage = async ({
  suspensionId,
  senderRole,
  senderId,
  message,
}) => {
  return sequelize.transaction(async (transaction) => {
    const suspension = await AccountSuspension.findByPk(suspensionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!suspension) {
      const error = new Error("Suspension not found");
      error.statusCode = 404;
      throw error;
    }

    if (suspension.status !== ACTIVE_STATUS) {
      const error = new Error("Suspension is not active");
      error.statusCode = 400;
      throw error;
    }

    const trimmedMessage = (message || "").trim();
    if (!trimmedMessage) {
      const error = new Error("Message is required");
      error.statusCode = 400;
      throw error;
    }

    const record = await SuspensionMessage.create(
      {
        suspension_id: suspensionId,
        sender_role: senderRole,
        sender_id: senderId,
        message: trimmedMessage,
      },
      { transaction }
    );

    const plainMessage = record.get({ plain: true });

    transaction.afterCommit(async () => {
      try {
        const [adminUnread, userUnread] = await Promise.all([
          exports.countUnreadMessages({
            suspensionId,
            viewerRole: "admin",
          }),
          exports.countUnreadMessages({
            suspensionId,
            viewerRole: "user",
          }),
        ]);

        const unreadCounts = { admin: adminUnread, user: userUnread };

        emitSuspensionMessage({
          suspensionId,
          message: plainMessage,
          unreadCounts,
        });

        emitAdminDashboardUpdate({
          type: "suspension_message",
          suspensionId,
          message: plainMessage,
          unreadCounts,
        });
      } catch (error) {
        console.error(
          "[SuspensionService] Failed to emit suspension message:",
          error
        );
      }
    });

    return plainMessage;
  });
};

exports.markMessagesAsRead = async ({ suspensionId, viewerRole }) => {
  await SuspensionMessage.update(
    { is_read: true, read_at: new Date() },
    {
      where: {
        suspension_id: suspensionId,
        is_read: false,
        sender_role: { [Op.ne]: viewerRole },
      },
    }
  );
  try {
    const [adminUnread, userUnread] = await Promise.all([
      exports.countUnreadMessages({
        suspensionId,
        viewerRole: "admin",
      }),
      exports.countUnreadMessages({
        suspensionId,
        viewerRole: "user",
      }),
    ]);

    emitSuspensionReadReceipt({
      suspensionId,
      unreadCounts: { admin: adminUnread, user: userUnread },
      readerRole: viewerRole,
    });
  } catch (error) {
    console.error(
      "[SuspensionService] Failed to emit read receipt:",
      error.message || error
    );
  }
};

exports.countUnreadMessages = async ({ suspensionId, viewerRole }) => {
  const unread = await SuspensionMessage.count({
    where: {
      suspension_id: suspensionId,
      is_read: false,
      sender_role: { [Op.ne]: viewerRole },
    },
  });
  return unread;
};

exports.getSuspensionThread = async ({ suspensionId }) => {
  const messages = await SuspensionMessage.findAll({
    where: { suspension_id: suspensionId },
    order: [["createdAt", "ASC"]],
  });
  return messages.map((record) => record.get({ plain: true }));
};

exports.validateSuspensionAccess = async ({ suspensionId, role, userId }) => {
  const suspension = await AccountSuspension.findByPk(suspensionId);
  if (!suspension) {
    const error = new Error("Suspension not found");
    error.statusCode = 404;
    throw error;
  }

  if (
    role === "user" &&
    suspension.public_user_id &&
    suspension.public_user_id !== userId
  ) {
    const error = new Error("You do not have access to this suspension");
    error.statusCode = 403;
    throw error;
  }

  return formatSuspension(suspension);
};
