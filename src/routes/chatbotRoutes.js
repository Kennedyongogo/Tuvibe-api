const express = require("express");
const router = express.Router();
const chatbotController = require("../controllers/chatbotController");

// Public endpoint - no authentication required for chatbot
router.post("/ask", chatbotController.askQuestion);
router.get("/capabilities", chatbotController.getCapabilities);

module.exports = router;

