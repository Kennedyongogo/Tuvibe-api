const express = require("express");
const router = express.Router();
const {
  createTestimony,
  getAllTestimonies,
  getTestimonyById,
  updateTestimony,
  updateTestimonyStatus,
  deleteTestimony,
  getApprovedTestimonies,
} = require("../controllers/testimonyController");
const { 
  authenticateAdmin,
  requireAdminOrHigher 
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

/**
 * @route   POST /api/testimonies
 * @desc    Create new testimony (public)
 * @access  Public
 */
router.post("/", createTestimony);

/**
 * @route   GET /api/testimonies/approved
 * @desc    Get approved testimonies for public display
 * @access  Public
 */
router.get("/approved", getApprovedTestimonies);

// All routes below require admin authentication
router.use(authenticateAdmin);

/**
 * @route   GET /api/testimonies
 * @desc    Get all testimonies with pagination and filters
 * @access  Admin
 */
router.get("/", getAllTestimonies);

/**
 * @route   GET /api/testimonies/:id
 * @desc    Get single testimony by ID
 * @access  Admin
 */
router.get("/:id", getTestimonyById);

/**
 * @route   PUT /api/testimonies/:id
 * @desc    Update testimony
 * @access  Admin
 */
router.put("/:id", updateTestimony);

/**
 * @route   PUT /api/testimonies/:id/status
 * @desc    Update testimony status (approve/reject)
 * @access  Admin
 */
router.put("/:id/status", updateTestimonyStatus);

/**
 * @route   DELETE /api/testimonies/:id
 * @desc    Delete testimony
 * @access  Admin
 */
router.delete("/:id", deleteTestimony);

// Error handling middleware
router.use(errorHandler);

module.exports = router;
