const express = require("express");
const router = express.Router();
const { getPremiumOverview } = require("../controllers/premiumStatsController");
const { authenticatePublic } = require("../middleware/publicAuth");

router.get("/overview", authenticatePublic, getPremiumOverview);

module.exports = router;
