const natural = require("natural");
const axios = require("axios");
const { MarketItem, LookingForPost, PublicUser } = require("../models");
const { Op } = require("sequelize");
const dataService = require("./dataService");

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
      const rawPosts = await LookingForPost.findAll({
        attributes: ["id", "content"],
        limit: 100,
        raw: true,
      });

      const posts = rawPosts.map((post) => ({
        id: post.id,
        title: post.content
          ? post.content.substring(0, 60).trim() || "Looking For"
          : "Looking For",
        description: post.content,
        content: post.content,
      }));

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
      gender: null,
      ageRange: null,
      verified: false,
      featured: false,
      premiumLounge: false,
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

    // Extract featured
    if (lowerQuestion.includes("featured")) {
      entities.featured = true;
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

    // Extract category (for users)
    const categories = ["regular", "sugar mummy", "sponsor", "ben 10"];
    for (const cat of categories) {
      if (lowerQuestion.includes(cat.toLowerCase())) {
        // Capitalize first letter of each word for proper category matching
        entities.category =
          cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
        if (cat === "sugar mummy") {
          entities.category = "Sugar Mummy";
        } else if (cat === "ben 10") {
          entities.category = "Ben 10";
        }
        break;
      }
    }

    // Extract gender
    if (lowerQuestion.includes("male") || lowerQuestion.includes("man")) {
      entities.gender = "Male";
    } else if (
      lowerQuestion.includes("female") ||
      lowerQuestion.includes("woman")
    ) {
      entities.gender = "Female";
    }

    // Extract age range
    const ageMatch = lowerQuestion.match(
      /(\d+)\s*(?:to|-|and)\s*(\d+)\s*years?/i
    );
    if (ageMatch) {
      entities.ageRange = {
        min: parseInt(ageMatch[1]),
        max: parseInt(ageMatch[2]),
      };
    } else {
      const singleAgeMatch = lowerQuestion.match(/(\d+)\s*years?/i);
      if (singleAgeMatch) {
        const age = parseInt(singleAgeMatch[1]);
        entities.ageRange = {
          min: age - 2,
          max: age + 2,
        };
      }
    }

    // Extract verified status
    if (
      lowerQuestion.includes("verified") ||
      lowerQuestion.includes("premium")
    ) {
      entities.verified = true;
    }

    // Extract premium lounge query
    if (
      lowerQuestion.includes("premium lounge") ||
      lowerQuestion.includes("premiumlounge") ||
      (lowerQuestion.includes("premium") && lowerQuestion.includes("lounge"))
    ) {
      entities.premiumLounge = true;
      entities.verified = true; // Premium lounge users are verified
    }

    // Extract search terms (improved)
    const searchKeywords = [
      "find",
      "search",
      "looking for",
      "need",
      "want",
      "show me",
      "get me",
    ];
    for (const keyword of searchKeywords) {
      if (lowerQuestion.includes(keyword)) {
        const parts = lowerQuestion.split(keyword);
        if (parts.length > 1 && parts[1].trim().length > 0) {
          // Extract meaningful search term (remove common words)
          const searchPart = parts[1]
            .trim()
            .replace(/^(a|an|the|some|any)\s+/i, "")
            .substring(0, 100);
          if (searchPart.length > 0) {
            entities.searchTerm = searchPart;
          }
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
    // Always prefer OpenAI for any question - it can handle any topic
    if (this.useOpenAI) {
      return await this.generateOpenAIResponse(
        intent,
        data,
        question,
        entities,
        conversationHistory
      );
    } else {
      // Enhanced NLP fallback that can handle general questions
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
      // Build context from platform data if available
      let contextInfo = "";
      if (data) {
        if (intent === "market_info") {
          contextInfo = `\n\nCurrent marketplace data:\n- Total items: ${
            data.totalItems || 0
          }\n- Featured items: ${data.featuredItems || 0}\n- Hot deals: ${
            data.hotDealsCount || 0
          }\n- Weekend picks: ${data.weekendPicksCount || 0}`;
          if (data.recentItems && data.recentItems.length > 0) {
            contextInfo += `\nRecent items: ${data.recentItems
              .slice(0, 3)
              .map((item) => `${item.title} ($${item.price})`)
              .join(", ")}`;
          }
        } else if (intent === "posts_info") {
          contextInfo = `\n\nCurrent posts data:\n- Total posts: ${
            data.totalPosts || 0
          }`;
          if (data.recentPosts && data.recentPosts.length > 0) {
            contextInfo += `\nRecent posts: ${data.recentPosts
              .slice(0, 3)
              .map((post) => post.title)
              .join(", ")}`;
          }
          if (data.allPosts && data.allPosts.length > 0) {
            contextInfo += `\nAll matching posts: ${JSON.stringify(
              data.allPosts.slice(0, 5).map((p) => ({
                title: p.title,
                content: p.content?.substring(0, 100),
                author: p.author?.name,
              }))
            )}`;
          }
        } else if (intent === "user_info") {
          contextInfo = `\n\nCurrent users data:\n- Total users: ${
            data.totalUsers || 0
          }\n- Verified users: ${data.verifiedUsers || 0}`;
          if (data.categoryStats) {
            contextInfo += `\nUsers by category: ${JSON.stringify(
              data.categoryStats
            )}`;
          }
          if (data.allUsers && data.allUsers.length > 0) {
            contextInfo += `\nMatching users: ${JSON.stringify(
              data.allUsers.slice(0, 5).map((u) => ({
                name: u.name,
                category: u.category,
                age: u.age,
              }))
            )}`;
          }
        }
      }

      const systemPrompt = `You are a helpful and friendly assistant for TuVibe platform. You can answer ANY question the user asks, whether it's about:
- TuVibe platform features (marketplace, posts, chat, user profiles, tokens, pricing)
- General questions about how to use the platform
- Information about marketplace items, hot deals, weekend picks
- Posts and what people are looking for
- User profiles and matching
- General knowledge and conversation
- Any other topic the user wants to discuss

Be friendly, helpful, and conversational. Answer questions naturally and provide useful information. If the question is about TuVibe platform, use the provided context data when available. For general questions, answer them normally as a helpful assistant would.${contextInfo}`;

      // Build message history - include conversation history and current question
      // Filter out empty messages and ensure proper formatting
      const messageHistory = conversationHistory
        .filter((msg) => msg && msg.text && msg.text.trim().length > 0)
        .slice(-5) // Last 5 messages from history
        .map((msg) => ({
          role: msg.isBot ? "assistant" : "user",
          content: msg.text.trim(),
        }));

      // Add current question if it's not already in the history
      // (Check if last message in history is the same as current question)
      const lastMessage = messageHistory[messageHistory.length - 1];
      if (!lastMessage || lastMessage.content !== question.trim()) {
        messageHistory.push({ role: "user", content: question.trim() });
      }

      const messages = [
        { role: "system", content: systemPrompt },
        ...messageHistory,
      ];

      console.log(
        `📝 Conversation history (${messageHistory.length} messages):`,
        messageHistory.map((m) => `${m.role}: ${m.content.substring(0, 50)}...`)
      );

      const response = await axios.post(
        `${this.openaiBaseUrl}/chat/completions`,
        {
          model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000, // Increased to allow longer, more detailed responses
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
        if (data) {
          // Check what type of user query it is
          const lowerQ = question.toLowerCase();

          // Premium lounge query
          if (lowerQ.includes("premium") || lowerQ.includes("premium lounge")) {
            const premiumUsers =
              data.allUsers?.filter(
                (u) =>
                  ["Sugar Mummy", "Sponsor", "Ben 10"].includes(u.category) &&
                  u.isVerified
              ) || [];

            if (premiumUsers.length > 0) {
              response = `Here are the verified premium users in Premium Lounge:\n\n`;
              premiumUsers.slice(0, 10).forEach((user) => {
                response += `• ${user.name}`;
                if (user.category) response += ` (${user.category})`;
                if (user.age) response += `, Age: ${user.age}`;
                response += `\n`;
              });
              if (premiumUsers.length > 10) {
                response += `\n...and ${
                  premiumUsers.length - 10
                } more premium users`;
              }
            } else {
              response = `There are currently no verified premium users in the Premium Lounge.`;
            }
          }
          // Category query
          else if (lowerQ.includes("categor") || lowerQ.includes("type")) {
            response = `Here are the user categories on TuVibe:\n\n`;
            if (data.categoryStats) {
              Object.entries(data.categoryStats).forEach(
                ([category, count]) => {
                  response += `• ${category}: ${count} users\n`;
                }
              );
            } else {
              response += `• Regular: ${data.totalUsers || 0} users\n`;
              response += `• Sugar Mummy: Available\n`;
              response += `• Sponsor: Available\n`;
              response += `• Ben 10: Available\n`;
            }
          }
          // Specific category query
          else if (
            entities.category ||
            lowerQ.includes("sugar mummy") ||
            lowerQ.includes("sponsor") ||
            lowerQ.includes("ben 10") ||
            lowerQ.includes("regular")
          ) {
            const categoryFilter =
              entities.category ||
              (lowerQ.includes("sugar mummy")
                ? "Sugar Mummy"
                : lowerQ.includes("sponsor")
                ? "Sponsor"
                : lowerQ.includes("ben 10")
                ? "Ben 10"
                : "Regular");

            const categoryUsers =
              data.allUsers?.filter((u) => u.category === categoryFilter) || [];

            if (categoryUsers.length > 0) {
              response = `Here are the ${categoryFilter} users:\n\n`;
              categoryUsers.slice(0, 10).forEach((user) => {
                response += `• ${user.name}`;
                if (user.age) response += `, Age: ${user.age}`;
                if (user.gender) response += `, ${user.gender}`;
                if (user.isVerified) response += ` ✓ Verified`;
                response += `\n`;
              });
              if (categoryUsers.length > 10) {
                response += `\n...and ${
                  categoryUsers.length - 10
                } more ${categoryFilter} users`;
              }
            } else {
              response = `There are currently no ${categoryFilter} users registered.`;
            }
          }
          // General user list query
          else if (
            lowerQ.includes("who are") ||
            lowerQ.includes("list users") ||
            lowerQ.includes("show users")
          ) {
            if (data.allUsers && data.allUsers.length > 0) {
              response = `Here are the users on TuVibe:\n\n`;
              response += `• Total users: ${data.totalUsers || 0}\n`;
              response += `• Verified users: ${data.verifiedUsers || 0}\n\n`;

              response += `Recent users:\n`;
              data.recentUsers.slice(0, 10).forEach((user) => {
                response += `• ${user.name}`;
                if (user.category) response += ` (${user.category})`;
                if (user.age) response += `, Age: ${user.age}`;
                if (user.isVerified) response += ` ✓ Verified`;
                response += `\n`;
              });
            } else {
              response = `Currently, there are ${
                data.totalUsers || 0
              } users registered on TuVibe.`;
            }
          }
          // Default: Show stats and guidance
          else {
            response = `Here's information about users on TuVibe:\n\n`;
            response += `• Total users: ${data.totalUsers || 0}\n`;
            response += `• Verified users: ${data.verifiedUsers || 0}\n`;

            if (
              data.categoryStats &&
              Object.keys(data.categoryStats).length > 0
            ) {
              response += `\nUsers by category:\n`;
              Object.entries(data.categoryStats).forEach(
                ([category, count]) => {
                  response += `  - ${category}: ${count} users\n`;
                }
              );
            }

            if (data.recentUsers && data.recentUsers.length > 0) {
              response += `\nRecent users:\n`;
              data.recentUsers.slice(0, 5).forEach((user) => {
                response += `  - ${user.name} (${user.category || "Regular"})`;
                if (user.isVerified) response += ` ✓`;
                response += `\n`;
              });
            }

            response += `\nYou can ask me:\n`;
            response += `• "Who are in premium lounge?" - See premium users\n`;
            response += `• "What are the user categories?" - See category breakdown\n`;
            response += `• "Show me Sugar Mummy users" - See specific category\n`;
          }
        } else {
          // No data available, provide general guidance
          response = `I can help you find users on TuVibe. You can:\n`;
          response += `• Browse users in Explore\n`;
          response += `• Search by category (Regular, Sugar Mummy, Sponsor, Ben 10)\n`;
          response += `• Filter by location, age, and preferences\n`;
          response += `• View premium users in Premium Lounge\n\n`;
          response += `Try asking me:\n`;
          response += `• "Who are the users?" - See all users\n`;
          response += `• "Who are in premium lounge?" - See premium users\n`;
          response += `• "What are the user categories?" - See category breakdown\n`;
        }
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
        // For general questions, provide a helpful response that acknowledges the question
        // and tries to answer it or provide guidance
        response = `I'm here to help! `;

        // Try to provide a helpful response based on the question
        const lowerQ = question.toLowerCase();
        if (
          lowerQ.includes("how") ||
          lowerQ.includes("what") ||
          lowerQ.includes("why") ||
          lowerQ.includes("when") ||
          lowerQ.includes("where")
        ) {
          response += `Regarding your question about "${question}", I can help you with information about TuVibe platform. `;
        }

        response += `I can provide information about:\n\n`;
        response += `🛍️ **Marketplace**: Items available for sale, hot deals, weekend picks\n`;
        response += `📋 **Posts**: What people are looking for\n`;
        response += `👥 **Users**: Finding and connecting with members\n`;
        response += `💰 **Pricing**: Token costs and payment information\n`;
        response += `ℹ️ **Platform Info**: How to use TuVibe\n\n`;

        // For general questions, be more conversational
        if (
          !lowerQ.includes("market") &&
          !lowerQ.includes("post") &&
          !lowerQ.includes("user") &&
          !lowerQ.includes("platform")
        ) {
          response += `I see you asked "${question}". While I can help with TuVibe-related questions, for the best experience with general questions, please make sure OpenAI API is configured. `;
        }

        response += `\nTry asking me:\n`;
        response += `• "What's for sale?"\n`;
        response += `• "Show me hot deals"\n`;
        response += `• "What are people looking for?"\n`;
        response += `• "How much does chat cost?"\n`;
        response += `• "Tell me about the platform"\n`;
        break;
    }

    return response.trim();
  }

  // Get data based on intent using dataService
  async getDataForIntent(intent, entities) {
    try {
      switch (intent) {
        case "market_info":
          return await this.getMarketInfo(entities);
        case "posts_info":
          return await this.getPostsInfo(entities);
        case "user_info":
          return await this.getUsersInfo(entities);
        default:
          return null;
      }
    } catch (error) {
      console.error("Error getting data for intent:", error);
      return null;
    }
  }

  // Get market information using dataService
  async getMarketInfo(entities = {}) {
    try {
      // Get market items with filters
      const filters = {
        tag: entities.tag,
        searchTerm: entities.searchTerm,
        dateRange: entities.dateRange,
        limit: 10,
        featured: entities.featured,
      };

      if (entities.priceRange) {
        filters.priceRange = {
          max: entities.priceRange,
        };
      }

      const items = await dataService.getMarketItems(filters);
      const stats = await dataService.getMarketStats();

      return {
        totalItems: stats.totalItems,
        featuredItems: stats.featuredItems,
        hotDealsCount: stats.hotDealsCount,
        weekendPicksCount: stats.weekendPicksCount,
        averagePrice: stats.averagePrice,
        recentItems: items.slice(0, 5).map((item) => ({
          title: item.title,
          price: item.price,
          tag: item.tag_label,
          isFeatured: item.is_featured,
        })),
        allItems: items, // Include all items for OpenAI context
      };
    } catch (error) {
      console.error("Error getting market info:", error);
      return null;
    }
  }

  // Get posts information using dataService
  async getPostsInfo(entities = {}) {
    try {
      const filters = {
        searchTerm: entities.searchTerm,
        dateRange: entities.dateRange,
        limit: 10,
      };

      const posts = await dataService.getPosts(filters);
      const stats = await dataService.getPostsStats();

      return {
        totalPosts: stats.totalPosts,
        recentPosts: posts.slice(0, 5).map((post) => ({
          title: post.title,
          description: post.content
            ? post.content.substring(0, 100) + "..."
            : null,
          author: post.author ? post.author.name : null,
        })),
        allPosts: posts, // Include all posts for OpenAI context
      };
    } catch (error) {
      console.error("Error getting posts info:", error);
      return null;
    }
  }

  // Get users information using dataService
  async getUsersInfo(entities = {}) {
    try {
      const filters = {
        category: entities.category,
        gender: entities.gender,
        searchTerm: entities.searchTerm,
        limit: entities.premiumLounge ? 50 : 10, // Get more users for premium lounge
        verified: entities.verified || entities.premiumLounge,
      };

      // If premium lounge query, filter for premium categories
      if (entities.premiumLounge) {
        // Premium lounge includes Sugar Mummy, Sponsor, and Ben 10
        // We'll filter after fetching to get all premium users
        filters.verified = true; // Premium lounge users must be verified
      }

      if (entities.ageRange) {
        filters.ageRange = entities.ageRange;
      }

      let users = await dataService.getUsers(filters);
      const stats = await dataService.getUsersStats();

      // If premium lounge, filter to only premium categories
      if (entities.premiumLounge) {
        users = users.filter(
          (u) =>
            ["Sugar Mummy", "Sponsor", "Ben 10"].includes(u.category) &&
            u.isVerified
        );
      }

      return {
        totalUsers: stats.totalUsers,
        verifiedUsers: stats.verifiedUsers,
        categoryStats: stats.categoryStats,
        recentUsers: users.slice(0, 5).map((user) => ({
          name: user.name,
          category: user.category,
          age: user.age,
          gender: user.gender,
          isVerified: user.isVerified,
        })),
        allUsers: users, // Include all users for OpenAI context
      };
    } catch (error) {
      console.error("Error getting users info:", error);
      return null;
    }
  }

  // Main method to process questions with ML
  async processQuestionWithML(question, conversationHistory = []) {
    try {
      // Detect intent with ML (for informational purposes, but don't restrict based on it)
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

      // Get relevant data for platform-specific intents using dataService
      // This allows the ML service to fetch real-time data from your models
      let data = null;
      if (
        intent === "market_info" ||
        intent === "posts_info" ||
        intent === "user_info"
      ) {
        data = await this.getDataForIntent(intent, entities);
      }

      // Generate response - OpenAI will handle any question, not just platform-specific ones
      const answer = await this.generateResponse(
        intent,
        data,
        question,
        entities,
        conversationHistory
      );

      // Generate suggestions (only for platform-related intents)
      const suggestions =
        intent !== "general_help" && confidence > 0.3
          ? this.generateSuggestions(intent)
          : [];

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
