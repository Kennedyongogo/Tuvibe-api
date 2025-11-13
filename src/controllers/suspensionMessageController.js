const suspensionService = require("../services/suspensionService");

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
