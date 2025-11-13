const suspensionService = require("../services/suspensionService");

const handleError = (res, error) => {
  const status = error.statusCode || 500;
  console.error("[SuspensionController] error:", error.message, error);
  return res.status(status).json({
    success: false,
    message: error.message || "An unexpected error occurred",
  });
};

exports.suspendUser = async (req, res) => {
  try {
    const { public_user_id, reason, metadata } = req.body;

    if (!public_user_id) {
      return res.status(400).json({
        success: false,
        message: "public_user_id is required",
      });
    }

    const result = await suspensionService.suspendAccount({
      publicUserId: public_user_id,
      adminUserId: req.userId,
      reason,
      metadata,
    });

    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      data: result.suspension,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.revokeSuspension = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Suspension id is required",
      });
    }

    const suspension = await suspensionService.revokeSuspension({
      suspensionId: id,
      adminUserId: req.userId,
    });

    return res.json({
      success: true,
      data: suspension,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getMyActiveSuspension = async (req, res) => {
  try {
    const suspension = await suspensionService.getActiveSuspensionForUser(
      req.publicUserId
    );

    if (!suspension) {
      return res.json({ success: true, data: null });
    }

    const fullSuspension = await suspensionService.getSuspensionById(
      suspension.id,
      true
    );

    const unreadCount = await suspensionService.countUnreadMessages({
      suspensionId: suspension.id,
      viewerRole: "user",
    });

    return res.json({
      success: true,
      data: {
        ...fullSuspension,
        unreadCount,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getSuspensionByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const activeOnly = req.query.active === "true";

    if (activeOnly) {
      const suspension = await suspensionService.getActiveSuspensionForUser(
        userId
      );
      return res.json({ success: true, data: suspension });
    }

    const suspensions = await suspensionService.listSuspensions({
      publicUserId: userId,
      limit: 100,
    });

    return res.json({
      success: true,
      data: suspensions,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.listSuspensions = async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    const result = await suspensionService.listSuspensions({
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
