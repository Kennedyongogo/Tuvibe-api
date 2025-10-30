const express = require('express');
const router = express.Router();
const { chat, getChatbotStatus, initializeChatbotEndpoint } = require('../controllers/chatbotController');

// Public routes (no authentication required for chatbot)
router.post('/chat', chat);
router.get('/status', getChatbotStatus);
router.post('/initialize', initializeChatbotEndpoint);

module.exports = router;
