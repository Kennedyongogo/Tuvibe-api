const natural = require("natural");
const axios = require("axios");
const { MarketItem, LookingForPost, PublicUser } = require("../models");
const { Op } = require("sequelize");

// Initialize NLP tools
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const TfIdf = natural.TfIdf;

class MLService {
  constructor() {
    this.useOpenAI = !!process.env.OPENAI_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiBaseUrl =
      process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    // Initialize TF-IDF for better semantic matching
    this.tfidf = new TfIdf();
    this.knowledgeBase = [];
    this.loadKnowledgeBase();

    if (this.useOpenAI) {
      console.log("🤖 ML Service: OpenAI mode enabled");
    } else {
      console.log("🤖 ML Service: Using enhanced NLP with TF-IDF");
    }
  }

  // Load knowledge base from database
  async loadKnowledgeBase() {
    try {
      // Load marketplace items
      const marketItems = await MarketItem.findAll({
        attributes: ["id", "title", "description", "price", "tag"],
        limit: 100,
      });

      // Load posts
      const posts = await LookingForPost.findAll({
        attributes: ["id", "title", "description"],
        limit: 100,
      });

      // Build knowledge base
      this.knowledgeBase = [
        ...marketItems.map((item) => ({
          type: "market",
          text: `${item.title} ${item.description || ""} ${item.tag || ""}`,
          data: item,
        })),
        ...posts.map((post) => ({
          type: "post",
          text: `${post.title} ${post.description || ""}`,
          data: post,
        })),
      ];

      // Add documents to TF-IDF
      this.knowledgeBase.forEach((doc, index) => {
        this.tfidf.addDocument(doc.text.toLowerCase());
      });

      console.log(
        `📚 Loaded ${this.knowledgeBase.length} documents into knowledge base`
      );
    } catch (error) {
      console.error("Error loading knowledge base:", error);
    }
  }

  // Enhanced intent detection with ML
  detectIntent(question, conversationHistory = []) {
    const lowerQuestion = question.toLowerCase();
    const tokens = tokenizer.tokenize(lowerQuestion) || [];
    const stemmedTokens = tokens.map((t) => stemmer.stem(t));

    // Enhanced intent keywords
    const intentKeywords = {
      market_info: [
        "market",
        "items",
        "products",
        "marketplace",
        "for sale",
        "buy",
        "purchase",
        "shop",
        "hot deals",
        "weekend picks",
        "featured",
        "price",
        "cost",
        "selling",
        "available",
      ],
      posts_info: [
        "posts",
        "looking for",
        "requests",
        "needs",
        "want",
        "searching",
        "find",
        "seeking",
      ],
      user_info: [
        "users",
        "people",
        "members",
        "profiles",
        "who",
        "find users",
        "search users",
        "explore",
      ],
      platform_info: [
        "what is",
        "tell me about",
        "explain",
        "information",
        "about",
        "help",
        "how does",
        "how to",
        "platform",
        "service",
        "features",
        "capabilities",
      ],
      pricing_info: [
        "price",
        "cost",
        "tokens",
        "payment",
        "pay",
        "how much",
        "fee",
        "charge",
      ],
      general_help: [
        "help",
        "support",
        "assistance",
        "guide",
        "how can i",
        "what can",
        "questions",
      ],
    };

    let maxScore = 0;
    let detectedIntent = "general_help";
    const scores = {};

    // Calculate scores for each intent
    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      let score = 0;
      for (const keyword of keywords) {
        const keywordTokens = tokenizer.tokenize(keyword.toLowerCase()) || [];
        const stemmedKeywords = keywordTokens.map((t) => stemmer.stem(t));

        // Token matching
        for (const kToken of stemmedKeywords) {
          if (stemmedTokens.includes(kToken)) {
            score += 2;
          }
        }

        // Phrase matching (higher weight)
        if (lowerQuestion.includes(keyword.toLowerCase())) {
          score += 3;
        }
      }
      scores[intent] = score;
      if (score > maxScore) {
        maxScore = score;
        detectedIntent = intent;
      }
    }

    // Use conversation history for context
    if (conversationHistory.length > 0) {
      const lastIntent =
        conversationHistory[conversationHistory.length - 1]?.intent;
      if (lastIntent && scores[lastIntent]) {
        scores[lastIntent] += 1; // Boost score for follow-up questions
      }
    }

    // Calculate confidence (normalized)
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? maxScore / (totalScore + 1) : 0.5;

    return { intent: detectedIntent, confidence: Math.min(confidence, 0.95) };
  }

  // Extract entities using NLP
  extractEntities(question) {
    const entities = {
      tag: null,
      dateRange: null,
      searchTerm: null,
      priceRange: null,
      category: null,
    };

    const lowerQuestion = question.toLowerCase();

    // Extract market tags
    if (
      lowerQuestion.includes("hot deal") ||
      lowerQuestion.includes("hot deals")
    ) {
      entities.tag = "hot_deals";
    } else if (
      lowerQuestion.includes("weekend pick") ||
      lowerQuestion.includes("weekend picks")
    ) {
      entities.tag = "weekend_picks";
    }

    // Extract date range
    if (lowerQuestion.includes("today")) {
      entities.dateRange = "today";
    } else if (
      lowerQuestion.includes("week") ||
      lowerQuestion.includes("weekly")
    ) {
      entities.dateRange = "week";
    } else if (
      lowerQuestion.includes("month") ||
      lowerQuestion.includes("monthly")
    ) {
      entities.dateRange = "month";
    }

    // Extract price range
    const priceMatch = lowerQuestion.match(/(\d+)\s*(dollar|dollars|usd|\$)/i);
    if (priceMatch) {
      entities.priceRange = parseFloat(priceMatch[1]);
    }

    // Extract category
    const categories = ["regular", "sugar mummy", "sponsor", "ben 10"];
    for (const cat of categories) {
      if (lowerQuestion.includes(cat)) {
        entities.category = cat;
        break;
      }
    }

    // Extract search terms
    const searchKeywords = ["find", "search", "looking for", "need", "want"];
    for (const keyword of searchKeywords) {
      if (lowerQuestion.includes(keyword)) {
        const parts = lowerQuestion.split(keyword);
        if (parts.length > 1 && parts[1].trim().length > 0) {
          entities.searchTerm = parts[1].trim().substring(0, 50);
        }
        break;
      }
    }

    return entities;
  }

  // Find relevant documents using TF-IDF
  findRelevantDocuments(question, limit = 5) {
    const questionLower = question.toLowerCase();
    const scores = [];

    this.knowledgeBase.forEach((doc, index) => {
      this.tfidf.tfidfs(questionLower, (i, measure) => {
        if (i === index) {
          scores.push({ index: i, score: measure, doc });
        }
      });
    });

    // Sort by score and return top results
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit).map((item) => item.doc);
  }

  // Generate response using OpenAI if available, otherwise use enhanced NLP
  async generateResponse(
    intent,
    data,
    question,
    entities,
    conversationHistory = []
  ) {
    if (this.useOpenAI) {
      return await this.generateOpenAIResponse(
        intent,
        data,
        question,
        entities,
        conversationHistory
      );
    } else {
      return this.generateNLPResponse(intent, data, question, entities);
    }
  }

  // Generate response using OpenAI
  async generateOpenAIResponse(
    intent,
    data,
    question,
    entities,
    conversationHistory
  ) {
    try {
      const systemPrompt = `You are a helpful assistant for TuVibe platform. You help users with:
- Marketplace information (items, prices, hot deals, weekend picks)
- Posts information (what people are looking for)
- User profiles and matching
- Platform features and help
- Pricing and token information

Be friendly, concise, and helpful. Use the provided data to answer questions accurately.`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.slice(-5).map((msg) => ({
          role: msg.isBot ? "assistant" : "user",
          content: msg.isBot ? msg.text : msg.text,
        })),
        { role: "user", content: question },
      ];

      const response = await axios.post(
        `${this.openaiBaseUrl}/chat/completions`,
        {
          model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
          messages: messages,
          temperature: 0.7,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openaiApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error("OpenAI API error:", error.response?.data || error.message);
      // Fallback to NLP
      return this.generateNLPResponse(intent, data, question, entities);
    }
  }

  // Generate response using enhanced NLP
  generateNLPResponse(intent, data, question, entities) {
    let response = "";

    // Find relevant documents
    const relevantDocs = this.findRelevantDocuments(question, 3);

    switch (intent) {
      case "market_info":
        if (data) {
          response = `Here's what's available in the marketplace:\n`;
          response += `• Total items: ${data.totalItems}\n`;

          if (data.featuredItems > 0) {
            response += `• Featured items: ${data.featuredItems}\n`;
          }

          if (data.hotDealsCount > 0) {
            response += `• Hot deals: ${data.hotDealsCount}\n`;
          }

          if (data.weekendPicksCount > 0) {
            response += `• Weekend picks: ${data.weekendPicksCount}\n`;
          }

          if (data.averagePrice && parseFloat(data.averagePrice) > 0) {
            response += `• Average price: $${data.averagePrice}\n`;
          }

          if (data.recentItems && data.recentItems.length > 0) {
            response += `\nRecent listings:\n`;
            data.recentItems.slice(0, 3).forEach((item) => {
              response += `  - ${item.title} ($${item.price})`;
              if (item.tag) response += ` [${item.tag}]`;
              if (item.isFeatured) response += ` ⭐`;
              response += `\n`;
            });
          }

          // Add relevant items from knowledge base
          if (relevantDocs.length > 0) {
            response += `\nRelated items:\n`;
            relevantDocs.slice(0, 2).forEach((doc) => {
              if (doc.type === "market") {
                response += `  - ${doc.data.title} ($${doc.data.price})\n`;
              }
            });
          }
        } else {
          response = `I can help you find items in our marketplace. Try asking: "What's for sale?" or "Show me hot deals"`;
        }
        break;

      case "posts_info":
        if (data) {
          response = `Here's what people are looking for:\n`;
          response += `• Total posts: ${data.totalPosts}\n`;

          if (data.recentPosts && data.recentPosts.length > 0) {
            response += `\nRecent posts:\n`;
            data.recentPosts.slice(0, 3).forEach((post) => {
              response += `  - ${post.title}`;
              if (post.description) {
                response += `: ${post.description}`;
              }
              response += `\n`;
            });
          }

          // Add relevant posts from knowledge base
          if (relevantDocs.length > 0) {
            relevantDocs.forEach((doc) => {
              if (doc.type === "post") {
                response += `  - ${doc.data.title}\n`;
              }
            });
          }
        } else {
          response = `I can help you find what people are looking for. Try asking: "What are people looking for?"`;
        }
        break;

      case "user_info":
        response = `I can help you find users on TuVibe. You can:\n`;
        response += `• Browse users in Explore\n`;
        response += `• Search by category (Regular, Sugar Mummy, Sponsor, Ben 10)\n`;
        response += `• Filter by location, age, and preferences\n`;
        response += `• View premium users in Premium Lounge\n`;
        break;

      case "pricing_info":
        response = `TuVibe uses a token system:\n`;
        response += `• Chat unlock costs vary by user category:\n`;
        response += `  - Regular users: 5 tokens\n`;
        response += `  - Sugar Mummy/Sponsor: 20 tokens\n`;
        response += `  - Ben 10: 10 tokens\n`;
        response += `• Premium category upgrades cost tokens\n`;
        response += `• You can purchase tokens in your wallet\n`;
        break;

      case "platform_info":
        response = `Welcome to TuVibe! Here's what you can do:\n\n`;
        response += `📦 **Marketplace**: Browse and shop for items from our community\n`;
        response += `  - Hot Deals: Special discounted items\n`;
        response += `  - Weekend Picks: Curated selections\n`;
        response += `  - Featured items: Highlighted listings\n\n`;
        response += `📝 **Posts**: See what people are looking for or post your own requests\n\n`;
        response += `💬 **Chat**: Connect with other members\n\n`;
        response += `👥 **Explore**: Discover and connect with users\n\n`;
        response += `\nI can help you with:\n`;
        response += `• Finding items in the marketplace\n`;
        response += `• Information about what people are looking for\n`;
        response += `• User search and matching\n`;
        response += `• General questions about the platform\n`;
        break;

      case "general_help":
      default:
        response = `I'm here to help! I can provide information about:\n\n`;
        response += `🛍️ **Marketplace**: Items available for sale, hot deals, weekend picks\n`;
        response += `📋 **Posts**: What people are looking for\n`;
        response += `👥 **Users**: Finding and connecting with members\n`;
        response += `💰 **Pricing**: Token costs and payment information\n`;
        response += `ℹ️ **Platform Info**: How to use TuVibe\n\n`;
        response += `Try asking me:\n`;
        response += `• "What's for sale?"\n`;
        response += `• "Show me hot deals"\n`;
        response += `• "What are people looking for?"\n`;
        response += `• "How much does chat cost?"\n`;
        response += `• "Tell me about the platform"\n`;
        break;
    }

    return response.trim();
  }

  // Get data based on intent
  async getDataForIntent(intent, entities) {
    try {
      switch (intent) {
        case "market_info":
          return await this.getMarketInfo(entities);
        case "posts_info":
          return await this.getPostsInfo(entities);
        default:
          return null;
      }
    } catch (error) {
      console.error("Error getting data for intent:", error);
      return null;
    }
  }

  // Get market information
  async getMarketInfo(entities = {}) {
    const where = {};

    if (entities.tag) {
      where.tag = entities.tag;
    }

    if (entities.dateRange) {
      const now = new Date();
      let startDate;
      if (entities.dateRange === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (entities.dateRange === "week") {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
      } else if (entities.dateRange === "month") {
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
      }
      if (startDate) {
        where.createdAt = { [Op.gte]: startDate };
      }
    }

    if (entities.priceRange) {
      where.price = { [Op.lte]: entities.priceRange };
    }

    const totalItems = await MarketItem.count({ where });
    const featuredItems = await MarketItem.count({
      where: { ...where, is_featured: true },
    });

    const hotDealsCount = await MarketItem.count({
      where: { ...where, tag: "hot_deals" },
    });

    const weekendPicksCount = await MarketItem.count({
      where: { ...where, tag: "weekend_picks" },
    });

    const recentItems = await MarketItem.findAll({
      where,
      attributes: ["id", "title", "price", "tag", "is_featured", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 5,
      raw: true,
    });

    return {
      totalItems,
      featuredItems,
      hotDealsCount,
      weekendPicksCount,
      recentItems: recentItems.map((item) => ({
        title: item.title,
        price: item.price,
        tag:
          item.tag === "hot_deals"
            ? "Hot Deals"
            : item.tag === "weekend_picks"
            ? "Weekend Picks"
            : null,
        isFeatured: item.is_featured,
      })),
    };
  }

  // Get posts information
  async getPostsInfo(entities = {}) {
    const where = {};

    if (entities.dateRange) {
      const now = new Date();
      let startDate;
      if (entities.dateRange === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (entities.dateRange === "week") {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
      } else if (entities.dateRange === "month") {
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
      }
      if (startDate) {
        where.createdAt = { [Op.gte]: startDate };
      }
    }

    if (entities.searchTerm) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${entities.searchTerm}%` } },
        { description: { [Op.iLike]: `%${entities.searchTerm}%` } },
      ];
    }

    const totalPosts = await LookingForPost.count({ where });

    const recentPosts = await LookingForPost.findAll({
      where,
      attributes: ["id", "title", "description", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 5,
      raw: true,
    });

    return {
      totalPosts,
      recentPosts: recentPosts.map((post) => ({
        title: post.title,
        description: post.description
          ? post.description.substring(0, 100) + "..."
          : null,
      })),
    };
  }

  // Main method to process questions with ML
  async processQuestionWithML(question, conversationHistory = []) {
    try {
      // Detect intent with ML
      const { intent, confidence } = this.detectIntent(
        question,
        conversationHistory
      );

      // Extract entities
      const entities = this.extractEntities(question);

      console.log(
        `🤖 ML Detected intent: ${intent} (confidence: ${confidence})`
      );
      console.log(`📊 Extracted entities:`, entities);

      // Get relevant data
      const data = await this.getDataForIntent(intent, entities);

      // Generate response
      const answer = await this.generateResponse(
        intent,
        data,
        question,
        entities,
        conversationHistory
      );

      // Generate suggestions
      const suggestions = this.generateSuggestions(intent);

      return {
        success: true,
        answer,
        intent,
        confidence,
        entities,
        suggestions,
      };
    } catch (error) {
      console.error("Error processing question with ML:", error);
      return {
        success: false,
        answer:
          "I'm sorry, I encountered an error while processing your question. Please try again.",
        error: error.message,
      };
    }
  }

  // Generate follow-up suggestions
  generateSuggestions(intent) {
    const suggestionsMap = {
      market_info: [
        "Show me hot deals",
        "What are the weekend picks?",
        "Show featured items",
      ],
      posts_info: ["What are people looking for?", "Show recent posts"],
      user_info: ["How do I find users?", "What are the user categories?"],
      pricing_info: ["How do I buy tokens?", "What are the chat costs?"],
      platform_info: [
        "How do I use the marketplace?",
        "How do I unlock chats?",
      ],
      general_help: [
        "What's for sale?",
        "How does the platform work?",
        "Tell me about tokens",
      ],
    };

    return suggestionsMap[intent] || [];
  }

  // Get ML service status
  async getMLStatus() {
    return {
      mlEnabled: true,
      openaiEnabled: this.useOpenAI,
      knowledgeBaseSize: this.knowledgeBase.length,
      capabilities: [
        "Natural language understanding",
        "Intent detection",
        "Entity extraction",
        "Semantic search (TF-IDF)",
        ...(this.useOpenAI ? ["OpenAI GPT integration"] : []),
      ],
    };
  }

  // Train model (placeholder for future implementation)
  async trainModel(trainingData, modelType = "intent") {
    // This would implement actual model training
    // For now, return mock results
    return {
      accuracy: 0.85,
      model_type: modelType,
      message: "Model training completed (mock)",
    };
  }
}

module.exports = new MLService();
