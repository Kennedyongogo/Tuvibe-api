const express = require("express");
const router = express.Router();
const {
  createInquiry,
  getAllInquiries,
  getInquiryById,
  updateInquiry,
  updateInquiryStatus,
  addDescriptionUpdate,
  deleteInquiry,
  getInquiryStats,
} = require("../controllers/inquiryController");
const { authenticateAdmin, optionalAuth } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

/**
 * @route   POST /api/inquiries
 * @desc    Create new inquiry (public endpoint)
 * @access  Public
 */
router.post("/", createInquiry);

/**
 * @route   GET /api/inquiries
 * @desc    Get all inquiries with pagination and filters
 * @access  Admin
 */
router.get("/", authenticateAdmin, getAllInquiries);

/**
 * @route   GET /api/inquiries/stats
 * @desc    Get inquiry statistics
 * @access  Admin
 */
router.get("/stats", authenticateAdmin, getInquiryStats);

/**
 * @route   GET /api/inquiries/:id
 * @desc    Get single inquiry by ID
 * @access  Admin
 */
router.get("/:id", authenticateAdmin, getInquiryById);

/**
 * @route   PUT /api/inquiries/:id
 * @desc    Update inquiry
 * @access  Admin
 */
router.put("/:id", authenticateAdmin, updateInquiry);

/**
 * @route   PUT /api/inquiries/:id/status
 * @desc    Update inquiry status
 * @access  Admin
 */
router.put("/:id/status", authenticateAdmin, updateInquiryStatus);

/**
 * @route   POST /api/inquiries/:id/description
 * @desc    Add description update to inquiry
 * @access  Admin
 */
router.post("/:id/description", authenticateAdmin, addDescriptionUpdate);

/**
 * @route   DELETE /api/inquiries/:id
 * @desc    Delete inquiry
 * @access  Admin
 */
router.delete("/:id", authenticateAdmin, deleteInquiry);

// Error handling middleware
router.use(errorHandler);

module.exports = router;

