const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const cron = require("node-cron");
const { initializeModels, setupAssociations } = require("./models");
const { errorHandler } = require("./middleware/errorHandler");
const storyService = require("./services/storyService");
const notificationService = require("./services/notificationService");

// Import active routes only
const adminUserRoutes = require("./routes/adminUserRoutes");
const publicUserRoutes = require("./routes/publicUserRoutes");
const tokenRoutes = require("./routes/tokenRoutes");
const chatUnlockRoutes = require("./routes/chatUnlockRoutes");
const premiumVerificationRoutes = require("./routes/premiumVerificationRoutes");
const marketItemRoutes = require("./routes/marketItemRoutes");
const lookingForPostRoutes = require("./routes/lookingForPostRoutes");
const favouriteRoutes = require("./routes/favouriteRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const paystackRoutes = require("./routes/paystackRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const paystackWebhookRoutes = require("./routes/paystackWebhook");
const notificationRoutes = require("./routes/notificationRoutes");
const moderationRoutes = require("./routes/moderationRoutes");
const statsRoutes = require("./routes/statsRoutes");
const premiumStatsRoutes = require("./routes/premiumStatsRoutes");
const reportRoutes = require("./routes/reportRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");
const mlRoutes = require("./routes/mlRoutes");
const suspensionRoutes = require("./routes/suspensionRoutes");
const sseRoutes = require("./routes/sseRoutes");
const storyRoutes = require("./routes/storyRoutes");
const storyMusicRoutes = require("./routes/storyMusicRoutes");
const postRoutes = require("./routes/postRoutes");
const ratingTestimonialRoutes = require("./routes/ratingTestimonialRoutes");
const {
  forgotPassword: adminForgotPassword,
} = require("./controllers/adminUserController");

const app = express();

// Middleware
app.use(
  express.json({
    limit: "500mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ limit: "500mb", extended: true }));
app.use(cors());

// Static file serving
const profilesUploadPath = path.join(__dirname, "..", "uploads", "profiles");
const documentsUploadPath = path.join(__dirname, "..", "uploads", "documents");
const projectsUploadPath = path.join(__dirname, "..", "uploads", "projects");
const inquiriesUploadPath = path.join(__dirname, "..", "uploads", "inquiries");
const marketUploadPath = path.join(__dirname, "..", "uploads", "market");
const storiesUploadPath = path.join(__dirname, "..", "uploads", "stories");
const postsUploadPath = path.join(__dirname, "..", "uploads", "posts");
const musicUploadPath = path.join(__dirname, "..", "uploads", "music");
const musicAudioPath = path.join(__dirname, "..", "uploads", "music", "audio");
const musicCoversPath = path.join(
  __dirname,
  "..",
  "uploads",
  "music",
  "covers"
);
const miscUploadPath = path.join(__dirname, "..", "uploads", "misc");

console.log("📁 Upload Paths:");
console.log(
  "  - Profiles:",
  profilesUploadPath,
  "- Exists:",
  fs.existsSync(profilesUploadPath)
);
console.log(
  "  - Documents:",
  documentsUploadPath,
  "- Exists:",
  fs.existsSync(documentsUploadPath)
);
console.log(
  "  - Projects:",
  projectsUploadPath,
  "- Exists:",
  fs.existsSync(projectsUploadPath)
);
console.log(
  "  - Inquiries:",
  inquiriesUploadPath,
  "- Exists:",
  fs.existsSync(inquiriesUploadPath)
);
console.log(
  "  - Market:",
  marketUploadPath,
  "- Exists:",
  fs.existsSync(marketUploadPath)
);
console.log(
  "  - Stories:",
  storiesUploadPath,
  "- Exists:",
  fs.existsSync(storiesUploadPath)
);
console.log(
  "  - Posts:",
  postsUploadPath,
  "- Exists:",
  fs.existsSync(postsUploadPath)
);
console.log(
  "  - Misc:",
  miscUploadPath,
  "- Exists:",
  fs.existsSync(miscUploadPath)
);
console.log(
  "  - Music:",
  musicUploadPath,
  "- Exists:",
  fs.existsSync(musicUploadPath)
);

// Serve static files
app.use("/uploads/profiles", express.static(profilesUploadPath));
app.use("/uploads/documents", express.static(documentsUploadPath));
app.use("/uploads/projects", express.static(projectsUploadPath));
app.use("/uploads/inquiries", express.static(inquiriesUploadPath));
app.use("/uploads/market", express.static(marketUploadPath));
app.use("/uploads/stories", express.static(storiesUploadPath));
app.use("/uploads/posts", express.static(postsUploadPath));
app.use("/uploads/music", express.static(musicUploadPath));
app.use("/uploads/misc", express.static(miscUploadPath));

// API routes
console.log("🔗 Registering API routes...");

app.use("/api/admin-users", adminUserRoutes);
console.log("✅ /api/admin-users route registered");

app.use("/api/public", publicUserRoutes);
console.log("✅ /api/public route registered");

// Stats route
app.use("/api/stats", statsRoutes);
console.log("✅ /api/stats route registered");

app.use("/api/premium/stats", premiumStatsRoutes);
console.log("✅ /api/premium/stats route registered");

// TuVibe routes
app.use("/api/tokens", tokenRoutes);
app.use("/api/chat", chatUnlockRoutes);
app.use("/api/verification", premiumVerificationRoutes);
app.use("/api/market", marketItemRoutes);
app.use("/api/looking-for-posts", lookingForPostRoutes);
app.use("/api/favourites", favouriteRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/paystack/webhook", paystackWebhookRoutes);
app.use("/api/paystack", paystackRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/moderation", moderationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/suspensions", suspensionRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/ml", mlRoutes);
app.use("/api/sse", sseRoutes.router);
app.use("/api/stories/music", storyMusicRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/ratings", ratingTestimonialRoutes);
console.log("✅ TuVibe routes registered");
console.log("✅ /api/chatbot route registered");
console.log("✅ /api/ml route registered");
console.log("✅ /api/sse route registered");
console.log("✅ /api/stories route registered");
console.log("✅ /api/posts route registered");

// Removed legacy routes: projects, documents, inquiries, audit, reports, analytics, chatbot, testimonies

// Forgot password endpoint
app.post("/api/auth/forgot", adminForgotPassword);
console.log("✅ /api/auth/forgot route registered");

console.log("✅ All API routes registered");

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// 404 handler for API routes (must be after all other routes)
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      message: "API endpoint not found",
      path: req.originalUrl,
    });
  }
  next();
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Create upload directories if they don't exist
const createUploadDirectories = () => {
  const uploadDirs = [
    path.join(__dirname, "..", "uploads"),
    path.join(__dirname, "..", "uploads", "profiles"),
    path.join(__dirname, "..", "uploads", "documents"),
    path.join(__dirname, "..", "uploads", "projects"),
    path.join(__dirname, "..", "uploads", "inquiries"),
    path.join(__dirname, "..", "uploads", "market"),
    path.join(__dirname, "..", "uploads", "stories"),
    path.join(__dirname, "..", "uploads", "posts"),
    path.join(__dirname, "..", "uploads", "music"),
    path.join(__dirname, "..", "uploads", "music", "audio"),
    path.join(__dirname, "..", "uploads", "music", "covers"),
    path.join(__dirname, "..", "uploads", "misc"),
  ];

  uploadDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created upload directory: ${dir}`);
    }
  });
};

// Background job disabled - online status is now managed only through login/logout endpoints
// Users remain online until they explicitly log out
const startOfflineTracking = () => {
  // Background job disabled - online status managed by login/logout endpoints only
  console.log("Online status tracking: Manual (login/logout endpoints only)");
};

// Start story cleanup and maintenance jobs
const startStoryJobs = () => {
  // Clean up expired stories every hour
  cron.schedule("0 * * * *", async () => {
    try {
      await storyService.cleanupExpiredStories();
    } catch (err) {
      console.error("[Story Jobs] Error cleaning expired stories:", err);
    }
  });

  // Publish scheduled stories every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      await storyService.publishScheduledStories();
    } catch (err) {
      console.error("[Story Jobs] Error publishing scheduled stories:", err);
    }
  });

  // Update challenge counts every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    try {
      await storyService.updateChallengeCounts();
    } catch (err) {
      console.error("[Story Jobs] Error updating challenge counts:", err);
    }
  });

  // Clean up orphaned reactions/comments/views every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    try {
      await storyService.cleanupOrphanedRecords();
    } catch (err) {
      console.error("[Story Jobs] Error cleaning orphaned records:", err);
    }
  });

  console.log("✅ Story maintenance jobs started");
};

// Start notification cleanup jobs
const startNotificationJobs = () => {
  // Clean up old notifications daily at 2 AM
  cron.schedule("0 2 * * *", async () => {
    try {
      await notificationService.cleanupOldNotifications(7, 7);
      // 7 days (1 week) for all notifications (read and unread)
    } catch (err) {
      console.error(
        "[Notification Jobs] Error cleaning old notifications:",
        err
      );
    }
  });

  console.log("✅ Notification maintenance jobs started");
};

// Start subscription expiration notification jobs
const startSubscriptionNotificationJobs = () => {
  // Check for expiring/expired subscriptions daily at 9:00 AM
  cron.schedule("0 9 * * *", async () => {
    try {
      const subscriptionNotificationService = require("./services/subscriptionNotificationService");
      await subscriptionNotificationService.runSubscriptionExpirationChecks();
    } catch (err) {
      console.error(
        "[Subscription Notification Jobs] Error checking subscription expirations:",
        err
      );
    }
  });

  console.log("✅ Subscription notification jobs started");
};

// Initialize models and associations
const initializeApp = async () => {
  try {
    console.log("🚀 Initializing application...");

    // Create upload directories
    createUploadDirectories();
    console.log("✅ Upload directories ready");

    // Initialize database models
    await initializeModels();
    console.log("✅ Database models initialized");

    // Setup model associations
    setupAssociations();
    console.log("✅ Model associations configured");

    // Start background job to track user online status
    startOfflineTracking();

    // Start story maintenance jobs
    startStoryJobs();

    // Start notification cleanup jobs
    startNotificationJobs();

    // Start subscription expiration notification jobs
    startSubscriptionNotificationJobs();

    // Chatbot removed

    console.log("✅ Application initialized successfully");
    return true;
  } catch (error) {
    console.error("❌ Error initializing application:", error);
    console.error("❌ Full error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      parent: error.parent?.message,
      original: error.original?.message,
    });
    throw error;
  }
};

// Export the initialization promise
const appInitialized = initializeApp();

module.exports = { app, appInitialized };
