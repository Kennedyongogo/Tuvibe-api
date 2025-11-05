const chatbotService = require("../services/chatbotService");
const mlService = require("../services/mlService");

// Process chatbot question - PUBLIC INFORMATION ONLY
// No authentication required, but only exposes public marketplace and posts data
// Now uses ML service for enhanced responses
exports.askQuestion = async (req, res) => {
  try {
    const { question, conversation_history } = req.body;

    if (
      !question ||
      typeof question !== "string" ||
      question.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Question is required and must be a non-empty string",
      });
    }

    // Use ML service for enhanced processing
    const result = await mlService.processQuestionWithML(
      question.trim(),
      conversation_history || []
    );

    return res.status(200).json({
      success: result.success,
      data: {
        reply: result.answer,
        answer: result.answer, // Keep both for compatibility
        intent: result.intent,
        confidence: result.confidence,
        entities: result.entities,
        suggestions: result.suggestions,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Chatbot controller error:", error);
    // Fallback to basic chatbot service
    try {
      const { question } = req.body;
      if (question) {
        const fallbackResult = await chatbotService.processQuestion(
          question.trim()
        );
        return res.status(200).json({
          success: fallbackResult.success,
          data: {
            reply: fallbackResult.answer,
            answer: fallbackResult.answer,
            intent: fallbackResult.intent,
            confidence: fallbackResult.confidence,
            entities: fallbackResult.entities,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (fallbackError) {
      return res.status(500).json({
        success: false,
        message: "Failed to process question",
        error: error.message,
      });
    }
  }
};

// New endpoint that matches frontend expectation
exports.chat = async (req, res) => {
  try {
    const { message, conversation_history } = req.body;

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Message is required and must be a non-empty string",
      });
    }

    // Use ML service
    const result = await mlService.processQuestionWithML(
      message.trim(),
      conversation_history || []
    );

    return res.status(200).json({
      success: result.success,
      data: {
        reply: result.answer,
        intent: result.intent,
        confidence: result.confidence,
        entities: result.entities,
        suggestions: result.suggestions,
      },
    });
  } catch (error) {
    console.error("Chatbot chat error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process message",
      error: error.message,
    });
  }
};

// Get chatbot capabilities/info
exports.getCapabilities = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        capabilities: [
          "Marketplace information (items, prices, hot deals, weekend picks)",
          "Posts information (what people are looking for)",
          "Platform information and help",
        ],
        examples: [
          "What's for sale?",
          "Show me hot deals",
          "What are people looking for?",
          "Tell me about the platform",
          "Show me weekend picks",
          "Help me find items",
        ],
      },
    });
  } catch (error) {
    console.error("Get capabilities error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get capabilities",
      error: error.message,
    });
  }
};
