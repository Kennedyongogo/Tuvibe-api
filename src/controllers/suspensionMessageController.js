const suspensionService = require("../services/suspensionService");
const { sendEventToUser } = require("../routes/sseRoutes");

const getRole = (req) => (req.userType === "admin" ? "admin" : "user");
const getSenderId = (req, role) =>
  role === "admin" ? req.userId : req.publicUserId;

const handleError = (res, error) => {
  const status = error.statusCode || 500;
  console.error("[SuspensionMessageController] error:", error.message, error);
  return res.status(status).json({
    success: false,
    message: error.message || "An unexpected error occurred",
  });
};

exports.sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const role = getRole(req);
    const senderId = getSenderId(req, role);

    await suspensionService.validateSuspensionAccess({
      suspensionId: id,
      role,
      userId: senderId,
    });

    const record = await suspensionService.createSuspensionMessage({
      suspensionId: id,
      senderRole: role,
      senderId,
      message,
    });

    // Get suspension to find the user ID
    const suspension = await suspensionService.getSuspensionById(id, false);

    // Get unread count for the user
    const unreadCount = await suspensionService.countUnreadMessages({
      suspensionId: id,
      viewerRole: "user",
    });

    // Send SSE event for new message (only to the user, not admin)
    if (suspension && suspension.public_user_id) {
      try {
        sendEventToUser(suspension.public_user_id, "suspension:message:new", {
          suspensionId: id,
          message: record,
          unreadCounts: { user: unreadCount },
        });
      } catch (sseError) {
        console.error(
          "[SSE] Error sending suspension:message:new event:",
          sseError
        );
      }
    }

    return res.status(201).json({
      success: true,
      data: record,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const role = getRole(req);
    const viewerId = getSenderId(req, role);

    const suspension = await suspensionService.validateSuspensionAccess({
      suspensionId: id,
      role,
      userId: viewerId,
    });

    const messages = await suspensionService.getSuspensionThread({
      suspensionId: id,
    });

    await suspensionService.markMessagesAsRead({
      suspensionId: id,
      viewerRole: role,
    });

    const unreadCount = await suspensionService.countUnreadMessages({
      suspensionId: id,
      viewerRole: role,
    });

    return res.json({
      success: true,
      data: {
        suspension,
        messages,
        unreadCount,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const role = getRole(req);
    const viewerId = getSenderId(req, role);

    await suspensionService.validateSuspensionAccess({
      suspensionId: id,
      role,
      userId: viewerId,
    });

    await suspensionService.markMessagesAsRead({
      suspensionId: id,
      viewerRole: role,
    });

    // Get unread count after marking as read
    const unreadCount = await suspensionService.countUnreadMessages({
      suspensionId: id,
      viewerRole: role,
    });

    // Get suspension to find the user ID
    const suspension = await suspensionService.getSuspensionById(id, false);

    // Send SSE event for messages read (only to the user)
    if (suspension && suspension.public_user_id && role === "user") {
      try {
        sendEventToUser(suspension.public_user_id, "suspension:messages:read", {
          suspensionId: id,
          unreadCounts: { user: unreadCount },
        });
      } catch (sseError) {
        console.error(
          "[SSE] Error sending suspension:messages:read event:",
          sseError
        );
      }
    }

    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const { id } = req.params;
    const role = getRole(req);
    const viewerId = getSenderId(req, role);

    await suspensionService.validateSuspensionAccess({
      suspensionId: id,
      role,
      userId: viewerId,
    });

    const unreadCount = await suspensionService.countUnreadMessages({
      suspensionId: id,
      viewerRole: role,
    });

    return res.json({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
