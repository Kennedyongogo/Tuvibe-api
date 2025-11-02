const express = require("express");
const router = express.Router();
const { getDashboardStats } = require("../controllers/statsController");
const { authenticateAdmin } = require("../middleware/auth");

// Admin-only routes for dashboard statistics
router.get("/dashboard", authenticateAdmin, getDashboardStats);

module.exports = router;
