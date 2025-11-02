const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const { initializeModels, setupAssociations } = require("./models");
const { AdminUser } = require("./models");
const { errorHandler } = require("./middleware/errorHandler");

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
const notificationRoutes = require("./routes/notificationRoutes");
const moderationRoutes = require("./routes/moderationRoutes");
const statsRoutes = require("./routes/statsRoutes");

const app = express();

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());

// Static file serving
const profilesUploadPath = path.join(__dirname, "..", "uploads", "profiles");
const documentsUploadPath = path.join(__dirname, "..", "uploads", "documents");
const projectsUploadPath = path.join(__dirname, "..", "uploads", "projects");
const inquiriesUploadPath = path.join(__dirname, "..", "uploads", "inquiries");
const marketUploadPath = path.join(__dirname, "..", "uploads", "market");
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
  "  - Misc:",
  miscUploadPath,
  "- Exists:",
  fs.existsSync(miscUploadPath)
);

// Serve static files
app.use("/uploads/profiles", express.static(profilesUploadPath));
app.use("/uploads/documents", express.static(documentsUploadPath));
app.use("/uploads/projects", express.static(projectsUploadPath));
app.use("/uploads/inquiries", express.static(inquiriesUploadPath));
app.use("/uploads/market", express.static(marketUploadPath));
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

// TuVibe routes
app.use("/api/tokens", tokenRoutes);
app.use("/api/chat", chatUnlockRoutes);
app.use("/api/verification", premiumVerificationRoutes);
app.use("/api/market", marketItemRoutes);
app.use("/api/posts", lookingForPostRoutes);
app.use("/api/favourites", favouriteRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/moderation", moderationRoutes);
console.log("✅ TuVibe routes registered");

// Removed legacy routes: projects, documents, inquiries, audit, reports, analytics, chatbot, testimonies

// Forgot password endpoint
app.post("/api/auth/forgot", async (req, res) => {
  try {
    const { Email } = req.body;

    if (!Email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    // Find admin by email
    const admin = await AdminUser.findOne({ where: { email: Email } });
    if (!admin) {
      return res.status(404).json({
        success: false,
        error: "No account found with this email address",
      });
    }

    // Generate a new random password (8 characters)
    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update admin password
    await admin.update({ password: hashedPassword });

    // Send email with new password
    try {
      // Create transporter (using Gmail SMTP)
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "ongogokennedy89@gmail.com", // Your Gmail
          pass: "mnfj zxio cgxw zefv", // Your Gmail App Password
        },
      });

      // Email content
      const mailOptions = {
        from: "ongogokennedy89@gmail.com", // Your Gmail
        to: Email,
        subject: "Password Reset - Mwalimu Hope Foundation Admin Portal",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>Hello ${admin.name},</p>
            <p>Your password has been reset for the Mwalimu Hope Foundation Admin Portal.</p>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #666; margin-top: 0;">Your New Login Credentials:</h3>
              <p><strong>Email:</strong> ${Email}</p>
              <p><strong>New Password:</strong> <code style="background-color: #e9e9e9; padding: 2px 6px; border-radius: 3px;">${newPassword}</code></p>
            </div>
            <p>Please login with these credentials and change your password immediately for security reasons.</p>
            <p>If you did not request this password reset, please contact the administrator immediately.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">This is an automated message from Mwalimu Hope Foundation Admin Portal.</p>
          </div>
        `,
      };

      // Send email
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      // Don't fail the request if email fails, just log it silently
    }

    res.status(200).json({
      success: true,
      message: "Password reset email sent",
    });
  } catch (error) {
    console.error("Error in forgot password:", error);
    res.status(500).json({
      success: false,
      error: "Error processing password reset",
    });
  }
});
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
