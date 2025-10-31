const {
  PublicUser,
  TokenTransaction,
  ChatUnlock,
  MarketItem,
} = require("../models");

// Basic analytics for dashboard
exports.analytics = async (_req, res) => {
  try {
    const [usersCount, premiumCount, tokensSum, unlocksCount, itemsCount] =
      await Promise.all([
        PublicUser.count(),
        PublicUser.count({ where: { isVerified: true } }),
        TokenTransaction.sum("amount").then((v) => Number(v || 0)),
        ChatUnlock.count({ where: { status: "success" } }),
        MarketItem.count(),
      ]);
    return res.json({
      success: true,
      data: { usersCount, premiumCount, tokensSum, unlocksCount, itemsCount },
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
const config = require("../config/config");
const { Op } = require("sequelize");

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

// Get platform dashboard stats
const getDashboardStats = async (req, res) => {
  try {
    // Get counts
    const totalAdmins = await AdminUser.count();
    const totalPublicUsers = await PublicUser.count();
    const totalPremiumUsers = await PublicUser.count({
      where: { isVerified: true },
    });
    const totalMarketItems = await MarketItem.count();
    const totalChatUnlocks = await ChatUnlock.count();

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalAdmins,
          totalPublicUsers,
          totalPremiumUsers,
          totalMarketItems,
          totalChatUnlocks,
        },
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
