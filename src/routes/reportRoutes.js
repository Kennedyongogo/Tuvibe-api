const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { authenticateAdmin } = require("../middleware/auth");

// All report routes require admin authentication
router.use(authenticateAdmin);

/**
 * @route   GET /api/reports/data
 * @desc    Get report data based on date range
 * @query   startDate, endDate, reportType (all, projects, inquiries, documents, activities)
 * @access  Admin
 */
router.get("/data", reportController.getReportData);

/**
 * @route   GET /api/reports/pdf
 * @desc    Generate and download PDF report
 * @query   startDate, endDate, reportType
 * @access  Admin
 */
router.get("/pdf", reportController.generatePDF);

/**
 * @route   GET /api/reports/word
 * @desc    Generate and download Word report
 * @query   startDate, endDate, reportType
 * @access  Admin
 */
router.get("/word", reportController.generateWord);

/**
 * @route   GET /api/reports/summary
 * @desc    Get summary statistics for charts
 * @query   startDate, endDate, groupBy (day, week, month)
 * @access  Admin
 */
router.get("/summary", reportController.getSummaryStats);

module.exports = router;

