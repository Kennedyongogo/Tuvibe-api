const chatbotService = require("../services/chatbotService");

// Process chatbot question - PUBLIC INFORMATION ONLY
// No authentication required, but only exposes public marketplace and posts data
exports.askQuestion = async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Question is required and must be a non-empty string",
      });
    }

    // Process the question
    const result = await chatbotService.processQuestion(question.trim());

    return res.status(200).json({
      success: result.success,
      data: {
        answer: result.answer,
        intent: result.intent,
        confidence: result.confidence,
        entities: result.entities,
        timestamp: new Date().toISOString(),
      },
      // Include raw data if available (optional, can be removed for production)
      ...(result.data && { rawData: result.data }),
    });
  } catch (error) {
    console.error("Chatbot controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process question",
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

