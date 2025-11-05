const mlService = require("../services/mlService");

// Enhanced chatbot question processing with ML
exports.processQuestion = async (req, res) => {
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

    // Process question with ML
    const result = await mlService.processQuestionWithML(
      question.trim(),
      conversation_history || []
    );

    return res.status(200).json({
      success: result.success,
      data: {
        answer: result.answer,
        intent: result.intent,
        confidence: result.confidence,
        entities: result.entities,
        suggestions: result.suggestions,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("ML controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process question",
      error: error.message,
    });
  }
};

// Get ML model status and capabilities
exports.getMLStatus = async (req, res) => {
  try {
    const status = await mlService.getMLStatus();
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("Get ML status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get ML status",
      error: error.message,
    });
  }
};

// Train or update ML model (admin only)
exports.trainModel = async (req, res) => {
  try {
    const { training_data, model_type } = req.body;

    if (!training_data || !Array.isArray(training_data)) {
      return res.status(400).json({
        success: false,
        message: "Training data is required and must be an array",
      });
    }

    const result = await mlService.trainModel(training_data, model_type);

    return res.status(200).json({
      success: true,
      data: {
        message: "Model training completed",
        accuracy: result.accuracy,
        model_type: result.model_type,
      },
    });
  } catch (error) {
    console.error("Train model error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to train model",
      error: error.message,
    });
  }
};
