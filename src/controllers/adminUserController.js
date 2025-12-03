const {
  PublicUser,
  ChatUnlock,
  MarketItem,
  Subscription,
  SubscriptionUsage,
} = require("../models");

// Basic analytics for dashboard - Subscription-based
exports.analytics = async (_req, res) => {
  try {
    const now = new Date();
    const [
      usersCount,
      premiumCount,
      activeSubscriptions,
      unlocksCount,
      itemsCount,
    ] = await Promise.all([
      PublicUser.count(),
      PublicUser.count({ where: { isVerified: true } }),
      Subscription.count({
        where: {
          status: "active",
          starts_at: { [Op.lte]: now },
          expires_at: { [Op.gt]: now },
        },
      }),
      ChatUnlock.count({ where: { status: "success" } }),
      MarketItem.count(),
    ]);
    return res.json({
      success: true,
      data: {
        usersCount,
        premiumCount,
        activeSubscriptions,
        unlocksCount,
        itemsCount,
      },
    });
  } catch (err) {
    console.error("analytics error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch analytics" });
  }
};
const { AdminUser } = require("../models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const config = require("../config/config");
const { Op, Sequelize } = require("sequelize");

// Create first admin (no auth required if no admins exist)
const createFirstAdmin = async (req, res) => {
  try {
    // Check if any admin exists
    const adminCount = await AdminUser.count();
    if (adminCount > 0) {
      return res.status(403).json({
        success: false,
        message:
          "Admin already exists. Use authenticated route to create more admins.",
      });
    }

    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    // Check if admin already exists
    const existingAdmin = await AdminUser.findOne({ where: { email } });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin (force superadmin role for first admin)
    const admin = await AdminUser.create({
      name,
      email,
      password: hashedPassword,
      phone: phone || null,
      role: role || "superadmin",
    });

    res.status(201).json({
      success: true,
      message: "First admin created successfully",
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Error creating first admin:", error);
    res.status(500).json({
      success: false,
      message: "Error creating admin",
      error: error.message,
    });
  }
};

// Create admin user
const createAdmin = async (req, res) => {
  try {
    const { name, full_name, email, password, phone, role } = req.body;

    // Check if admin already exists
    const existingAdmin = await AdminUser.findOne({ where: { email } });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Use name or full_name field
    const adminName = name || full_name;

    // Create admin with only fields that exist in the model
    const admin = await AdminUser.create({
      name: adminName,
      email,
      password: hashedPassword,
      phone: phone || null,
      role: role || "moderator",
    });

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    res.status(500).json({
      success: false,
      message: "Error creating admin",
      error: error.message,
    });
  }
};

// Forgot password for admin users
exports.forgotPassword = async (req, res) => {
  try {
    const emailFromBody = req.body?.Email || req.body?.email;

    if (!emailFromBody || typeof emailFromBody !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Email is required" });
    }

    const normalizedEmail = emailFromBody.trim().toLowerCase();

    const admin = await AdminUser.findOne({
      where: Sequelize.where(
        Sequelize.fn("LOWER", Sequelize.col("email")),
        normalizedEmail
      ),
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: "No account found with this email address",
      });
    }

    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await admin.update({ password: hashedPassword });

    const emailConfig = config.emailService || {};
    const transporter = nodemailer.createTransport({
      service: emailConfig.provider || "gmail",
      auth: {
        user: emailConfig.user || "tuvibeonline@gmail.com",
        pass: emailConfig.pass || "eraw tjci pfcs jfii",
      },
    });

    try {
      await transporter.sendMail({
        from: emailConfig.user || "tuvibeonline@gmail.com",
        to: normalizedEmail,
        subject: "TuVibe Admin Password Reset",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">TuVibe Admin Password Reset</h2>
            <p>Hello ${admin.name || "Admin"},</p>
            <p>Your TuVibe Admin Portal password has been reset.</p>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #666; margin-top: 0;">Temporary Credentials:</h3>
              <p><strong>Email:</strong> ${normalizedEmail}</p>
              <p><strong>New Password:</strong> <code style="background-color: #e9e9e9; padding: 2px 6px; border-radius: 3px;">${newPassword}</code></p>
            </div>
            <p>Please log in with these credentials and change your password immediately.</p>
            <p>If you did not request this reset, contact the TuVibe support team right away.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">This is an automated message from the TuVibe Admin Portal.</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Admin password reset email error:", emailError);
    }

    return res.status(200).json({
      success: true,
      message: "Password reset email sent",
    });
  } catch (error) {
    console.error("admin forgot password error:", error);
    return res.status(500).json({
      success: false,
      error: "Error processing password reset",
    });
  }
};

// Login admin user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin
    const admin = await AdminUser.findOne({ where: { email } });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate token
    const token = jwt.sign(
      { id: admin.id, email: admin.email, type: "admin", role: admin.role },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          phone: admin.phone,
          role: admin.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({
      success: false,
      message: "Error logging in",
      error: error.message,
    });
  }
};

// Get all admins
const getAllAdmins = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions
    const whereClause = {};

    if (role) {
      whereClause.role = role;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await AdminUser.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ["password"] },
      limit: limitNum,
      offset: offset,
      order: [[sortBy, sortOrder]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching admins:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admins",
      error: error.message,
    });
  }
};

// Get admin by ID
const getAdminById = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await AdminUser.findByPk(id, {
      attributes: { exclude: ["password"] },
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    console.error("Error fetching admin:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admin",
      error: error.message,
    });
  }
};

// Update admin profile
const updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, full_name, email, phone, role } = req.body;

    const admin = await AdminUser.findByPk(id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Use name or full_name field
    const adminName = name || full_name;

    // Prepare update data with only fields that exist in the model
    const updateData = {};
    if (adminName) updateData.name = adminName;
    if (email) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (role) updateData.role = role;

    await admin.update(updateData);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    const admin = await AdminUser.findByPk(id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      admin.password
    );
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await admin.update({ password: hashedPassword });

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({
      success: false,
      message: "Error changing password",
      error: error.message,
    });
  }
};

// Update admin role
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const admin = await AdminUser.findByPk(id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    const oldRole = admin.role;
    await admin.update({ role });

    res.status(200).json({
      success: true,
      message: "Admin role updated successfully",
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({
      success: false,
      message: "Error updating role",
      error: error.message,
    });
  }
};

// Toggle admin active status
const toggleActiveStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await AdminUser.findByPk(id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Check if isActive field exists in the model
    if (!admin.hasOwnProperty("isActive")) {
      return res.status(400).json({
        success: false,
        message: "isActive field not available in admin model",
      });
    }

    const oldStatus = admin.isActive;
    await admin.update({ isActive: !admin.isActive });

    res.status(200).json({
      success: true,
      message: `Admin ${
        admin.isActive ? "activated" : "deactivated"
      } successfully`,
      data: {
        id: admin.id,
        name: admin.name || admin.full_name,
        isActive: admin.isActive,
      },
    });
  } catch (error) {
    console.error("Error toggling active status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating status",
      error: error.message,
    });
  }
};

// Delete admin
const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await AdminUser.findByPk(id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Store admin data for audit log
    const adminData = {
      name: admin.name,
      email: admin.email,
      role: admin.role,
    };

    await admin.destroy();

    res.status(200).json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting admin:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting admin",
      error: error.message,
    });
  }
};

// Get all admins (public - no auth required)
const getPublicAdmins = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions
    const whereClause = {};

    if (role) {
      whereClause.role = role;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await AdminUser.findAndCountAll({
      where: whereClause,
      attributes: ["id", "name", "email", "phone", "role", "createdAt"],
      limit: limitNum,
      offset: offset,
      order: [[sortBy, sortOrder]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching public admins:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admins",
      error: error.message,
    });
  }
};

// Get admin by ID (public - no auth required)
const getPublicAdminById = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await AdminUser.findOne({
      where: { id },
      attributes: ["id", "name", "email", "phone", "role", "createdAt"],
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    console.error("Error fetching public admin:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admin",
      error: error.message,
    });
  }
};

// Get platform dashboard stats - Subscription-based
const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setMonth(thisMonth.getMonth() - 1);

    // ==================== OVERVIEW STATS ====================
    const overview = {
      totalAdmins: await AdminUser.count(),
      totalPublicUsers: await PublicUser.count(),
      totalPremiumUsers: await PublicUser.count({
        where: { isVerified: true },
      }),
      totalMarketItems: await MarketItem.count(),
      onlineUsers: await PublicUser.count({ where: { is_online: true } }),
    };

    // User breakdown by category
    const usersByCategory = await PublicUser.findAll({
      attributes: [
        "category",
        [
          require("sequelize").fn("count", require("sequelize").col("id")),
          "count",
        ],
      ],
      group: ["category"],
      raw: true,
    });

    const categoryBreakdown = {
      Regular: 0,
      "Sugar Mummy": 0,
      Sponsor: 0,
      "Ben 10": 0,
      "Urban Chics": 0,
    };
    usersByCategory.forEach((row) => {
      if (categoryBreakdown.hasOwnProperty(row.category)) {
        categoryBreakdown[row.category] = parseInt(row.count) || 0;
      }
    });

    // ==================== SUBSCRIPTION STATS ====================
    const subscriptionStats = {
      // Total subscriptions
      totalSubscriptions: await Subscription.count(),
      activeSubscriptions: await Subscription.count({
        where: {
          status: "active",
          [Op.and]: [
            {
              [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
            },
            {
              [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
            },
          ],
        },
      }),
      expiredSubscriptions: await Subscription.count({
        where: { status: "expired" },
      }),
      pendingSubscriptions: await Subscription.count({
        where: { status: "pending" },
      }),
      cancelledSubscriptions: await Subscription.count({
        where: { status: "cancelled" },
      }),

      // Subscriptions by plan
      silverSubscriptions: await Subscription.count({
        where: {
          plan: "Silver",
          status: "active",
          [Op.and]: [
            {
              [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
            },
            {
              [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
            },
          ],
        },
      }),
      goldSubscriptions: await Subscription.count({
        where: {
          plan: "Gold",
          status: "active",
          [Op.and]: [
            {
              [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
            },
            {
              [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
            },
          ],
        },
      }),

      // Subscriptions by user category (Regular vs Premium)
      regularUserSubscriptions: await Subscription.count({
        include: [
          {
            model: PublicUser,
            as: "subscriber",
            where: { category: "Regular" },
            required: true,
          },
        ],
        where: {
          status: "active",
          [Op.and]: [
            {
              [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
            },
            {
              [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
            },
          ],
        },
      }),
      premiumUserSubscriptions: await Subscription.count({
        include: [
          {
            model: PublicUser,
            as: "subscriber",
            where: {
              category: {
                [Op.in]: ["Sugar Mummy", "Sponsor", "Ben 10", "Urban Chics"],
              },
            },
            required: true,
          },
        ],
        where: {
          status: "active",
          [Op.and]: [
            {
              [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
            },
            {
              [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
            },
          ],
        },
      }),

      // Subscription revenue
      totalRevenue: await Subscription.sum("amount", {
        where: { status: "active" },
      }).then((v) => Number(v || 0)),
      revenueToday: await Subscription.sum("amount", {
        where: {
          status: "active",
          createdAt: { [Op.gte]: today },
        },
      }).then((v) => Number(v || 0)),
      revenueThisWeek: await Subscription.sum("amount", {
        where: {
          status: "active",
          createdAt: { [Op.gte]: thisWeek },
        },
      }).then((v) => Number(v || 0)),
      revenueThisMonth: await Subscription.sum("amount", {
        where: {
          status: "active",
          createdAt: { [Op.gte]: thisMonth },
        },
      }).then((v) => Number(v || 0)),

      // Revenue by plan
      silverRevenue: await Subscription.sum("amount", {
        where: {
          plan: "Silver",
          status: "active",
        },
      }).then((v) => Number(v || 0)),
      goldRevenue: await Subscription.sum("amount", {
        where: {
          plan: "Gold",
          status: "active",
        },
      }).then((v) => Number(v || 0)),
    };

    // ==================== SUBSCRIPTION USAGE STATS ====================
    const todayStr = new Date().toISOString().slice(0, 10);
    const usageStats = {
      // Today's usage
      todayWhatsAppContacts: await SubscriptionUsage.sum(
        "whatsapp_contacts_used",
        {
          where: { usage_date: todayStr },
        }
      ).then((v) => Number(v || 0)),
      todayWhoViewed: await SubscriptionUsage.sum("who_viewed_used", {
        where: { usage_date: todayStr },
      }).then((v) => Number(v || 0)),
      todayPremiumUnlocks: await SubscriptionUsage.sum("premium_unlocks_used", {
        where: { usage_date: todayStr },
      }).then((v) => Number(v || 0)),
      todayBoosts: await SubscriptionUsage.sum("boost_hours_used", {
        where: { usage_date: todayStr },
      }).then((v) => Number(v || 0)),
      todaySuggestedMatches: await SubscriptionUsage.sum(
        "suggested_matches_used",
        {
          where: { usage_date: todayStr },
        }
      ).then((v) => Number(v || 0)),
      todayIncognitoMinutes: await SubscriptionUsage.sum(
        "incognito_minutes_used",
        {
          where: { usage_date: todayStr },
        }
      ).then((v) => Number(v || 0)),

      // This week's usage
      weekWhatsAppContacts: await SubscriptionUsage.sum(
        "whatsapp_contacts_used",
        {
          where: {
            usage_date: { [Op.gte]: thisWeek.toISOString().slice(0, 10) },
          },
        }
      ).then((v) => Number(v || 0)),
      weekWhoViewed: await SubscriptionUsage.sum("who_viewed_used", {
        where: {
          usage_date: { [Op.gte]: thisWeek.toISOString().slice(0, 10) },
        },
      }).then((v) => Number(v || 0)),
      weekPremiumUnlocks: await SubscriptionUsage.sum("premium_unlocks_used", {
        where: {
          usage_date: { [Op.gte]: thisWeek.toISOString().slice(0, 10) },
        },
      }).then((v) => Number(v || 0)),
      weekBoosts: await SubscriptionUsage.sum("boost_hours_used", {
        where: {
          usage_date: { [Op.gte]: thisWeek.toISOString().slice(0, 10) },
        },
      }).then((v) => Number(v || 0)),

      // This month's usage
      monthWhatsAppContacts: await SubscriptionUsage.sum(
        "whatsapp_contacts_used",
        {
          where: {
            usage_date: { [Op.gte]: thisMonth.toISOString().slice(0, 10) },
          },
        }
      ).then((v) => Number(v || 0)),
      monthWhoViewed: await SubscriptionUsage.sum("who_viewed_used", {
        where: {
          usage_date: { [Op.gte]: thisMonth.toISOString().slice(0, 10) },
        },
      }).then((v) => Number(v || 0)),
      monthPremiumUnlocks: await SubscriptionUsage.sum("premium_unlocks_used", {
        where: {
          usage_date: { [Op.gte]: thisMonth.toISOString().slice(0, 10) },
        },
      }).then((v) => Number(v || 0)),
      monthBoosts: await SubscriptionUsage.sum("boost_hours_used", {
        where: {
          usage_date: { [Op.gte]: thisMonth.toISOString().slice(0, 10) },
        },
      }).then((v) => Number(v || 0)),
    };

    // ==================== SUBSCRIPTION BREAKDOWN ====================
    // Regular users with subscriptions
    const regularSilverSubscriptions = await Subscription.count({
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          where: { category: "Regular" },
          required: true,
        },
      ],
      where: {
        plan: "Silver",
        status: "active",
        [Op.and]: [
          {
            [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
          },
          {
            [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
          },
        ],
      },
    });

    const regularGoldSubscriptions = await Subscription.count({
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          where: { category: "Regular" },
          required: true,
        },
      ],
      where: {
        plan: "Gold",
        status: "active",
        [Op.and]: [
          {
            [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
          },
          {
            [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
          },
        ],
      },
    });

    // Premium users with subscriptions
    const premiumSilverSubscriptions = await Subscription.count({
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          where: {
            category: {
              [Op.in]: ["Sugar Mummy", "Sponsor", "Ben 10", "Urban Chics"],
            },
          },
          required: true,
        },
      ],
      where: {
        plan: "Silver",
        status: "active",
        [Op.and]: [
          {
            [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
          },
          {
            [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
          },
        ],
      },
    });

    const premiumGoldSubscriptions = await Subscription.count({
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          where: {
            category: {
              [Op.in]: ["Sugar Mummy", "Sponsor", "Ben 10", "Urban Chics"],
            },
          },
          required: true,
        },
      ],
      where: {
        plan: "Gold",
        status: "active",
        [Op.and]: [
          {
            [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
          },
          {
            [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
          },
        ],
      },
    });

    const subscriptionBreakdown = {
      regularSilver: regularSilverSubscriptions,
      regularGold: regularGoldSubscriptions,
      premiumSilver: premiumSilverSubscriptions,
      premiumGold: premiumGoldSubscriptions,
    };

    // ==================== BADGE STATISTICS ====================
    // Gold Verification Badge: Regular users with Gold subscription + Premium users with Gold subscription
    const regularUsersWithGoldBadge = await Subscription.count({
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          where: { category: "Regular" },
          required: true,
        },
      ],
      where: {
        plan: "Gold",
        status: "active",
        [Op.and]: [
          {
            [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
          },
          {
            [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
          },
        ],
      },
    });

    const premiumUsersWithGoldBadge = await Subscription.count({
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          where: {
            category: {
              [Op.in]: ["Sugar Mummy", "Sponsor", "Ben 10", "Urban Chics"],
            },
          },
          required: true,
        },
      ],
      where: {
        plan: "Gold",
        status: "active",
        [Op.and]: [
          {
            [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
          },
          {
            [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
          },
        ],
      },
    });

    // Premium Silver Badge: Premium users with Silver subscription
    const premiumUsersWithSilverBadge = await Subscription.count({
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          where: {
            category: {
              [Op.in]: ["Sugar Mummy", "Sponsor", "Ben 10", "Urban Chics"],
            },
          },
          required: true,
        },
      ],
      where: {
        plan: "Silver",
        status: "active",
        [Op.and]: [
          {
            [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
          },
          {
            [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
          },
        ],
      },
    });

    // Users with no badge: Regular users with Silver subscription or no subscription
    const regularUsersWithSilverSubscription = await Subscription.count({
      include: [
        {
          model: PublicUser,
          as: "subscriber",
          where: { category: "Regular" },
          required: true,
        },
      ],
      where: {
        plan: "Silver",
        status: "active",
        [Op.and]: [
          {
            [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
          },
          {
            [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
          },
        ],
      },
    });

    const totalUsersWithActiveSubscriptions = await Subscription.count({
      where: {
        status: "active",
        [Op.and]: [
          {
            [Op.or]: [{ starts_at: { [Op.lte]: now } }, { starts_at: null }],
          },
          {
            [Op.or]: [{ expires_at: { [Op.gt]: now } }, { expires_at: null }],
          },
        ],
      },
    });

    const usersWithoutSubscription =
      overview.totalPublicUsers - totalUsersWithActiveSubscriptions;

    const badgeStats = {
      // Gold Verification Badge (Regular Gold + Premium Gold)
      goldVerificationBadge:
        regularUsersWithGoldBadge + premiumUsersWithGoldBadge,
      goldVerificationBreakdown: {
        regularUsers: regularUsersWithGoldBadge,
        premiumUsers: premiumUsersWithGoldBadge,
      },

      // Premium Silver Badge (Premium Silver only)
      premiumSilverBadge: premiumUsersWithSilverBadge,

      // No Badge (Regular Silver + Users without subscription)
      noBadge: regularUsersWithSilverSubscription + usersWithoutSubscription,
      noBadgeBreakdown: {
        regularSilverSubscription: regularUsersWithSilverSubscription,
        noSubscription: usersWithoutSubscription,
      },

      // Total users with badges
      totalUsersWithBadges:
        regularUsersWithGoldBadge +
        premiumUsersWithGoldBadge +
        premiumUsersWithSilverBadge,
    };

    // ==================== OTHER STATS ====================
    const otherStats = {
      totalChatUnlocks: await ChatUnlock.count({
        where: { status: "success" },
      }),
      totalFavourites: await require("../models").Favourite.count(),
      totalProfileViews: await require("../models").ProfileView.count(),
    };

    res.status(200).json({
      success: true,
      data: {
        overview,
        categoryBreakdown,
        subscriptionStats,
        subscriptionBreakdown,
        usageStats,
        badgeStats,
        otherStats,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard stats",
      error: error.message,
    });
  }
};

module.exports = {
  createFirstAdmin,
  createAdmin,
  forgotPassword: exports.forgotPassword,
  login,
  getAllAdmins,
  getAdminById,
  getPublicAdmins,
  getPublicAdminById,
  updateProfile,
  changePassword,
  updateRole,
  toggleActiveStatus,
  deleteAdmin,
  getDashboardStats,
  analytics: exports.analytics,
};
