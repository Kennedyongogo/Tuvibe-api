const { AuditTrail } = require("../models");

/**
 * Log an audit trail entry
 * @param {Object} options - Audit log options
 * @param {string} options.user_id - ID of the user performing the action
 * @param {string} options.action - Action being performed (create, update, delete, etc.)
 * @param {string} options.resource_type - Type of resource (admin_user, project, inquiry, etc.)
 * @param {string} options.resource_id - ID of the resource being affected
 * @param {string} options.description - Human-readable description
 * @param {Object} options.old_values - Previous state before the action
 * @param {Object} options.new_values - New state after the action
 * @param {string} options.ip_address - IP address of the request
 * @param {string} options.user_agent - User agent of the request
 * @param {string} options.status - Status of the action (success, failed, pending)
 * @param {string} options.error_message - Error message if action failed
 * @param {Object} options.metadata - Additional contextual data
 * @returns {Promise<AuditTrail>}
 */
const logAudit = async (options) => {
  try {
    const {
      user_id = null,
      action,
      resource_type,
      resource_id = null,
      description,
      old_values = null,
      new_values = null,
      ip_address = null,
      user_agent = null,
      status = "success",
      error_message = null,
      metadata = null,
    } = options;

    const auditLog = await AuditTrail.create({
      user_id,
      action,
      resource_type,
      resource_id,
      description,
      old_values,
      new_values,
      ip_address,
      user_agent,
      status,
      error_message,
      metadata,
    });

    return auditLog;
  } catch (error) {
    // Log error but don't throw to avoid breaking the main operation
    console.error("Error logging audit trail:", error);
    return null;
  }
};

/**
 * Extract IP address from request
 * @param {Object} req - Express request object
 * @returns {string}
 */
const getIpAddress = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
};

/**
 * Extract user agent from request
 * @param {Object} req - Express request object
 * @returns {string}
 */
const getUserAgent = (req) => {
  return req.headers["user-agent"] || "unknown";
};

/**
 * Middleware to automatically extract request metadata
 * Usage: Add this to audit logging calls to automatically include IP and user agent
 * @param {Object} req - Express request object
 * @returns {Object}
 */
const getRequestMetadata = (req) => {
  return {
    ip_address: getIpAddress(req),
    user_agent: getUserAgent(req),
    user_id: req.user?.id || null,
  };
};

/**
 * Log user login
 */
const logLogin = async (user_id, req, success = true, error_message = null) => {
  return logAudit({
    user_id,
    action: success ? "login" : "login_failed",
    resource_type: "admin_user",
    resource_id: user_id,
    description: success
      ? `User logged in successfully`
      : `Failed login attempt: ${error_message}`,
    ip_address: getIpAddress(req),
    user_agent: getUserAgent(req),
    status: success ? "success" : "failed",
    error_message,
  });
};

/**
 * Log user logout
 */
const logLogout = async (user_id, req) => {
  return logAudit({
    user_id,
    action: "logout",
    resource_type: "admin_user",
    resource_id: user_id,
    description: `User logged out`,
    ip_address: getIpAddress(req),
    user_agent: getUserAgent(req),
  });
};

/**
 * Log resource creation
 */
const logCreate = async (user_id, resource_type, resource_id, new_values, req, description = null) => {
  return logAudit({
    user_id,
    action: "create",
    resource_type,
    resource_id,
    description: description || `Created new ${resource_type}`,
    new_values,
    ip_address: getIpAddress(req),
    user_agent: getUserAgent(req),
  });
};

/**
 * Log resource update
 */
const logUpdate = async (
  user_id,
  resource_type,
  resource_id,
  old_values,
  new_values,
  req,
  description = null
) => {
  return logAudit({
    user_id,
    action: "update",
    resource_type,
    resource_id,
    description: description || `Updated ${resource_type}`,
    old_values,
    new_values,
    ip_address: getIpAddress(req),
    user_agent: getUserAgent(req),
  });
};

/**
 * Log resource deletion
 */
const logDelete = async (user_id, resource_type, resource_id, old_values, req, description = null) => {
  return logAudit({
    user_id,
    action: "delete",
    resource_type,
    resource_id,
    description: description || `Deleted ${resource_type}`,
    old_values,
    ip_address: getIpAddress(req),
    user_agent: getUserAgent(req),
  });
};

/**
 * Log status change
 */
const logStatusChange = async (
  user_id,
  resource_type,
  resource_id,
  old_status,
  new_status,
  req,
  description = null
) => {
  return logAudit({
    user_id,
    action: "status_change",
    resource_type,
    resource_id,
    description: description || `Changed status from ${old_status} to ${new_status}`,
    old_values: { status: old_status },
    new_values: { status: new_status },
    ip_address: getIpAddress(req),
    user_agent: getUserAgent(req),
  });
};

/**
 * Log file upload
 */
const logUpload = async (user_id, resource_type, resource_id, file_info, req, description = null) => {
  return logAudit({
    user_id,
    action: "upload",
    resource_type,
    resource_id,
    description: description || `Uploaded file: ${file_info.filename}`,
    new_values: file_info,
    ip_address: getIpAddress(req),
    user_agent: getUserAgent(req),
  });
};

/**
 * Log file download
 */
const logDownload = async (user_id, resource_type, resource_id, file_info, req, description = null) => {
  return logAudit({
    user_id,
    action: "download",
    resource_type,
    resource_id,
    description: description || `Downloaded file: ${file_info.filename}`,
    metadata: file_info,
    ip_address: getIpAddress(req),
    user_agent: getUserAgent(req),
  });
};

module.exports = {
  logAudit,
  getIpAddress,
  getUserAgent,
  getRequestMetadata,
  logLogin,
  logLogout,
  logCreate,
  logUpdate,
  logDelete,
  logStatusChange,
  logUpload,
  logDownload,
};

