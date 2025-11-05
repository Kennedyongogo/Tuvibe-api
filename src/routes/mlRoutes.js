const express = require("express");
const router = express.Router();
const mlController = require("../controllers/mlController");

// Public endpoint - no authentication required for ML chatbot
router.post("/chat", mlController.processQuestion);
router.get("/status", mlController.getMLStatus);

// Admin endpoints (you can add auth middleware later)
// router.post("/train", auth, mlController.trainModel);

module.exports = router;
