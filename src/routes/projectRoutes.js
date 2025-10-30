const express = require("express");
const router = express.Router();
const {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  updateProjectStatus,
  deleteProject,
  getProjectStats,
} = require("../controllers/projectController");
const { 
  authenticateAdmin,
  requireAdminOrHigher 
} = require("../middleware/auth");
const {
  uploadProjectImages,
  handleUploadError,
} = require("../middleware/upload");
const { errorHandler } = require("../middleware/errorHandler");

// All routes require admin authentication
router.use(authenticateAdmin);

/**
 * @route   POST /api/projects
 * @desc    Create new project
 * @access  Admin
 */
router.post("/", createProject);

/**
 * @route   GET /api/projects
 * @desc    Get all projects with pagination and filters
 * @access  Admin
 */
router.get("/", getAllProjects);

/**
 * @route   GET /api/projects/stats
 * @desc    Get project statistics
 * @access  Admin
 */
router.get("/stats", getProjectStats);

/**
 * @route   GET /api/projects/:id
 * @desc    Get single project by ID
 * @access  Admin
 */
router.get("/:id", getProjectById);

/**
 * @route   PUT /api/projects/:id
 * @desc    Update project
 * @access  Admin
 */
router.put("/:id", uploadProjectImages, handleUploadError, updateProject);

/**
 * @route   PUT /api/projects/:id/status
 * @desc    Update project status with progress tracking
 * @access  Admin
 */
router.put(
  "/:id/status",
  uploadProjectImages,
  handleUploadError,
  updateProjectStatus
);

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project
 * @access  Admin
 */
router.delete("/:id", deleteProject);

// Error handling middleware
router.use(errorHandler);

module.exports = router;

