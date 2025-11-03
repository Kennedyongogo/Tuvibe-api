const natural = require("natural");
const { Sequelize } = require("sequelize");
const {
  MarketItem,
  LookingForPost,
} = require("../models");
const { Op } = require("sequelize");

// Initialize tokenizers and stemmers
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

// Intent classification keywords - PUBLIC INFORMATION ONLY
const intentKeywords = {
  market_info: [
    "market",
    "items",
    "products",
    "marketplace",
    "for sale",
    "market items",
    "listings",
    "what's for sale",
    "buy",
    "purchase",
    "shop",
    "hot deals",
    "weekend picks",
    "featured",
  ],
  posts_info: [
    "posts",
    "looking for",
    "what are people looking for",
    "requests",
    "needs",
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
  ],
  general_help: [
    "help",
    "support",
    "assistance",
    "guide",
    "how can i",
    "what can",
  ],
};

class ChatbotService {
  constructor() {
    // Initialize with OpenAI if API key is available (optional)
    this.useOpenAI = process.env.OPENAI_API_KEY ? true : false;
    if (this.useOpenAI) {
      // You can add OpenAI SDK here if needed
      console.log("🤖 Chatbot: OpenAI mode enabled");
    } else {
      console.log("🤖 Chatbot: Using natural language processing");
    }
  }

  // Detect intent from user question
  detectIntent(question) {
    const lowerQuestion = question.toLowerCase();
    const tokens = tokenizer.tokenize(lowerQuestion) || [];
    const stemmedTokens = tokens.map((t) => stemmer.stem(t));

    let maxScore = 0;
    let detectedIntent = "general_help";

    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      let score = 0;
      for (const keyword of keywords) {
        const keywordTokens = tokenizer.tokenize(keyword.toLowerCase()) || [];
        const stemmedKeywords = keywordTokens.map((t) => stemmer.stem(t));

        // Check if any keyword token matches question tokens
        for (const kToken of stemmedKeywords) {
          if (stemmedTokens.includes(kToken)) {
            score += 2;
          }
        }

        // Also check direct phrase match
        if (lowerQuestion.includes(keyword.toLowerCase())) {
          score += 3;
        }
      }

      if (score > maxScore) {
        maxScore = score;
        detectedIntent = intent;
      }
    }

    return { intent: detectedIntent, confidence: maxScore };
  }

  // Extract entities from question (e.g., tags, date ranges)
  extractEntities(question) {
    const entities = {
      tag: null,
      dateRange: null,
      searchTerm: null,
    };

    const lowerQuestion = question.toLowerCase();

    // Extract market tags
    if (lowerQuestion.includes("hot deal") || lowerQuestion.includes("hot deals")) {
      entities.tag = "hot_deals";
    } else if (lowerQuestion.includes("weekend pick") || lowerQuestion.includes("weekend picks")) {
      entities.tag = "weekend_picks";
    }

    // Extract date range
    if (lowerQuestion.includes("today")) {
      entities.dateRange = "today";
    } else if (lowerQuestion.includes("week") || lowerQuestion.includes("weekly")) {
      entities.dateRange = "week";
    } else if (lowerQuestion.includes("month") || lowerQuestion.includes("monthly")) {
      entities.dateRange = "month";
    }

    // Extract search terms (simple keyword extraction)
    const searchKeywords = ["find", "search", "looking for", "need"];
    for (const keyword of searchKeywords) {
      if (lowerQuestion.includes(keyword)) {
        // Try to extract what they're looking for (simplified)
        const parts = lowerQuestion.split(keyword);
        if (parts.length > 1 && parts[1].trim().length > 0) {
          entities.searchTerm = parts[1].trim().substring(0, 50); // Limit length
        }
        break;
      }
    }

    return entities;
  }

  // Get public marketplace information
  async getMarketInfo(entities = {}) {
    try {
      const where = {};
      
      // Filter by tag if specified
      if (entities.tag) {
        where.tag = entities.tag;
      }
      
      // Filter by date range if specified
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

      const totalItems = await MarketItem.count({ where });
      const featuredItems = await MarketItem.count({
        where: { ...where, is_featured: true },
      });

      // Get hot deals count
      const hotDealsCount = await MarketItem.count({
        where: { ...where, tag: "hot_deals" },
      });

      // Get weekend picks count
      const weekendPicksCount = await MarketItem.count({
        where: { ...where, tag: "weekend_picks" },
      });

      // Get average price (public information)
      const avgPriceResult = await MarketItem.findAll({
        attributes: [[Sequelize.fn("AVG", Sequelize.col("price")), "avgPrice"]],
        where,
        raw: true,
      });
      const avgPrice = avgPriceResult[0]?.avgPrice || 0;

      // Get recent items (public listings only)
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
        averagePrice: parseFloat(avgPrice).toFixed(2),
        recentItems: recentItems.map(item => ({
          title: item.title,
          price: item.price,
          tag: item.tag === "hot_deals" ? "Hot Deals" : item.tag === "weekend_picks" ? "Weekend Picks" : null,
          isFeatured: item.is_featured,
        })),
      };
    } catch (error) {
      console.error("Error fetching market info:", error);
      throw error;
    }
  }

  // Get public posts information
  async getPostsInfo(entities = {}) {
    try {
      const where = {};
      
      // Filter by date range if specified
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

      // Search term filter (basic)
      if (entities.searchTerm) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${entities.searchTerm}%` } },
          { description: { [Op.iLike]: `%${entities.searchTerm}%` } },
        ];
      }

      const totalPosts = await LookingForPost.count({ where });

      // Get recent posts (public information only - no personal details)
      const recentPosts = await LookingForPost.findAll({
        where,
        attributes: ["id", "title", "description", "createdAt"],
        order: [["createdAt", "DESC"]],
        limit: 5,
        raw: true,
      });

      return {
        totalPosts,
        recentPosts: recentPosts.map(post => ({
          title: post.title,
          description: post.description ? post.description.substring(0, 100) + "..." : null,
        })),
      };
    } catch (error) {
      console.error("Error fetching posts info:", error);
      throw error;
    }
  }

  // Generate natural language response - PUBLIC INFORMATION ONLY
  generateResponse(intent, data, question, entities) {
    let response = "";

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
          
          if (entities.tag) {
            const tagLabel = entities.tag === "hot_deals" ? "Hot Deals" : "Weekend Picks";
            response += `\n(Filtered by: ${tagLabel})`;
          }
          
          if (entities.dateRange) {
            response += `\n(Items from this ${entities.dateRange})`;
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
          
          if (entities.searchTerm) {
            response += `\n(Searching for: ${entities.searchTerm})`;
          }
          
          if (entities.dateRange) {
            response += `\n(Posts from this ${entities.dateRange})`;
          }
        } else {
          response = `I can help you find what people are looking for. Try asking: "What are people looking for?"`;
        }
        break;

      case "platform_info":
        response = `Welcome to TuVibe! Here's what you can do:\n\n`;
        response += `📦 **Marketplace**: Browse and shop for items from our community\n`;
        response += `  - Hot Deals: Special discounted items\n`;
        response += `  - Weekend Picks: Curated selections\n`;
        response += `  - Featured items: Highlighted listings\n\n`;
        response += `📝 **Posts**: See what people are looking for or post your own requests\n\n`;
        response += `💬 **Chat**: Connect with other members\n\n`;
        response += `\nI can help you with:\n`;
        response += `• Finding items in the marketplace\n`;
        response += `• Information about what people are looking for\n`;
        response += `• General questions about the platform\n`;
        response += `\nTry asking: "What's for sale?" or "Show me hot deals"`;
        break;

      case "general_help":
      default:
        response = `I'm here to help! I can provide information about:\n\n`;
        response += `🛍️ **Marketplace**: Items available for sale, hot deals, weekend picks\n`;
        response += `📋 **Posts**: What people are looking for\n`;
        response += `ℹ️ **Platform Info**: How to use TuVibe\n\n`;
        response += `Try asking me:\n`;
        response += `• "What's for sale?"\n`;
        response += `• "Show me hot deals"\n`;
        response += `• "What are people looking for?"\n`;
        response += `• "Tell me about the platform"\n`;
        break;
    }

    return response.trim();
  }

  // Main method to process questions
  async processQuestion(question) {
    try {
      // Detect intent
      const { intent, confidence } = this.detectIntent(question);
      
      // Extract entities
      const entities = this.extractEntities(question);

      console.log(`🤖 Detected intent: ${intent} (confidence: ${confidence})`);
      console.log(`📊 Extracted entities:`, entities);

      let data = null;

      // Fetch relevant data based on intent - PUBLIC INFORMATION ONLY
      switch (intent) {
        case "market_info":
          data = await this.getMarketInfo(entities);
          break;

        case "posts_info":
          data = await this.getPostsInfo(entities);
          break;

        case "platform_info":
        case "general_help":
        default:
          // Return general info without data fetch
          break;
      }

      // Generate response
      const response = this.generateResponse(intent, data, question, entities);

      return {
        success: true,
        answer: response,
        intent,
        confidence,
        entities,
        data: data || null,
      };
    } catch (error) {
      console.error("Error processing question:", error);
      return {
        success: false,
        answer: "I'm sorry, I encountered an error while processing your question. Please try again.",
        error: error.message,
      };
    }
  }
}

module.exports = new ChatbotService();

