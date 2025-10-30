const express = require("express");
const router = express.Router();
const {
  createDocument,
  getAllDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  downloadDocument,
  getDocumentStats,
} = require("../controllers/documentController");
const { authenticateAdmin } = require("../middleware/auth");
const {
  uploadDocument,
  handleUploadError,
} = require("../middleware/upload");
const { errorHandler } = require("../middleware/errorHandler");

// All routes require admin authentication
router.use(authenticateAdmin);

/**
 * @route   POST /api/documents
 * @desc    Upload new document
 * @access  Admin
 */
router.post(
  "/",
  uploadDocument,
  handleUploadError,
  createDocument
);

/**
 * @route   GET /api/documents
 * @desc    Get all documents with pagination and filters
 * @access  Admin
 */
router.get("/", getAllDocuments);

/**
 * @route   GET /api/documents/stats
 * @desc    Get document statistics
 * @access  Admin
 */
router.get("/stats", getDocumentStats);

/**
 * @route   GET /api/documents/:id
 * @desc    Get single document by ID
 * @access  Admin
 */
router.get("/:id", getDocumentById);

/**
 * @route   GET /api/documents/:id/download
 * @desc    Download document file
 * @access  Admin
 */
router.get("/:id/download", downloadDocument);

/**
 * @route   PUT /api/documents/:id
 * @desc    Update document details
 * @access  Admin
 */
router.put("/:id", updateDocument);

/**
 * @route   DELETE /api/documents/:id
 * @desc    Delete document
 * @access  Admin
 */
router.delete("/:id", deleteDocument);

// Error handling middleware
router.use(errorHandler);

module.exports = router;

