const express = require("express");
const router = express.Router();
const {
  getAllAuditLogs,
  getAuditLogById,
  getResourceAuditLogs,
  getUserAuditLogs,
  getAuditStats,
  exportAuditLogs,
} = require("../controllers/auditTrailController");
const { 
  authenticateAdmin, 
  requireSuperAdmin,
  requireAdminOrHigher 
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

// All routes require admin authentication
router.use(authenticateAdmin);

/**
 * @route   GET /api/audit-trail
 * @desc    Get all audit logs with pagination and filters
 * @access  Admin (elevated privileges)
 */
router.get("/", requireAdminOrHigher, getAllAuditLogs);

/**
 * @route   GET /api/audit-trail/stats
 * @desc    Get audit log statistics
 * @access  Admin (elevated privileges)
 */
router.get("/stats", requireAdminOrHigher, getAuditStats);

/**
 * @route   GET /api/audit-trail/export
 * @desc    Export audit logs (JSON or CSV)
 * @access  Super Admin
 */
router.get("/export", requireSuperAdmin, exportAuditLogs);

/**
 * @route   GET /api/audit-trail/resource/:resource_type/:resource_id
 * @desc    Get audit logs for a specific resource
 * @access  Admin
 */
router.get("/resource/:resource_type/:resource_id", getResourceAuditLogs);

/**
 * @route   GET /api/audit-trail/user/:user_id
 * @desc    Get audit logs for a specific user
 * @access  Admin (elevated privileges)
 */
router.get("/user/:user_id", requireAdminOrHigher, getUserAuditLogs);

/**
 * @route   GET /api/audit-trail/:id
 * @desc    Get single audit log by ID
 * @access  Admin (elevated privileges)
 */
router.get("/:id", requireAdminOrHigher, getAuditLogById);

// Error handling middleware
router.use(errorHandler);

module.exports = router;

