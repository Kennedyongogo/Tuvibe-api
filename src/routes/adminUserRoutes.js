const express = require("express");
const router = express.Router();
const {
  createAdmin,
  login,
  getAllAdmins,
  getAdminById,
  getPublicAdmins,
  getPublicAdminById,
  updateProfile,
  changePassword,
  updateRole,
  toggleActiveStatus,
  getDashboardStats,
  deleteAdmin,
} = require("../controllers/adminUserController");
const { 
  authenticateAdmin, 
  requireSuperAdmin,
  requireAdminOrHigher 
} = require("../middleware/auth");
const {
  uploadProfileImage,
  handleUploadError,
} = require("../middleware/upload");
const { errorHandler } = require("../middleware/errorHandler");

// Public routes
router.post("/login", login);
router.get("/public", getPublicAdmins);
router.get("/public/:id", getPublicAdminById);

// Protected routes - Admin authentication required
router.post(
  "/",
  authenticateAdmin,
  requireSuperAdmin,
  uploadProfileImage,
  handleUploadError,
  createAdmin
);

router.get("/dashboard/stats", authenticateAdmin, getDashboardStats);
router.get("/", authenticateAdmin, getAllAdmins);
router.get("/:id", authenticateAdmin, getAdminById);

router.put(
  "/:id",
  authenticateAdmin,
  uploadProfileImage,
  handleUploadError,
  updateProfile
);

router.put("/:id/password", authenticateAdmin, changePassword);
router.put("/:id/role", authenticateAdmin, requireSuperAdmin, updateRole);
router.put("/:id/toggle-status", authenticateAdmin, requireSuperAdmin, toggleActiveStatus);

router.delete("/:id", authenticateAdmin, requireSuperAdmin, deleteAdmin);

// Error handling middleware
router.use(errorHandler);

module.exports = router;
