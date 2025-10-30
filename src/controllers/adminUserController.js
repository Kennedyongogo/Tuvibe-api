const { AdminUser, Project, Inquiry, Document } = require("../models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { Op } = require("sequelize");
const { sequelize } = require("../models");
const { convertToRelativePath } = require("../utils/filePath");
const {
  logCreate,
  logUpdate,
  logDelete,
  logLogin,
  logStatusChange,
  logAudit,
} = require("../utils/auditLogger");

// Create admin user
const createAdmin = async (req, res) => {
  try {
    const { full_name, email, password, phone, position, description, role, isActive, whatsapp_link, google_link, twitter_link, facebook_link } =
      req.body;

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

    // Handle profile image
    let profileImagePath = null;
    if (req.file) {
      profileImagePath = convertToRelativePath(req.file.path);
    }

    // Create admin
    const admin = await AdminUser.create({
      full_name,
      email,
      password: hashedPassword,
      phone,
      position,
      description,
      role: role || "super-admin",
      isActive: isActive !== undefined ? isActive : true,
      profile_image: profileImagePath,
      whatsapp_link: whatsapp_link?.trim() || null,
      google_link: google_link?.trim() || null,
      twitter_link: twitter_link?.trim() || null,
      facebook_link: facebook_link?.trim() || null,
    });

    // Log audit trail
    await logCreate(
      req.user?.id || null,
      "admin_user",
      admin.id,
      { full_name, email, role: admin.role, phone, position, description },
      req,
      `Created new admin user: ${full_name}`
    );

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: {
        id: admin.id,
        full_name: admin.full_name,
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
      // Log failed login attempt
      await logLogin(null, req, false, "Invalid email");
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if active
    if (!admin.isActive) {
      // Log failed login attempt
      await logLogin(admin.id, req, false, "Account is inactive");
      return res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      // Log failed login attempt
      await logLogin(admin.id, req, false, "Invalid password");
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Update last login
    await admin.update({ lastLogin: new Date() });

    // Generate token
    const token = jwt.sign(
      { id: admin.id, email: admin.email, type: "admin", role: admin.role },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    // Log successful login
    await logLogin(admin.id, req, true);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        admin: {
          id: admin.id,
          full_name: admin.full_name,
          email: admin.email,
          phone: admin.phone,
          role: admin.role,
          position: admin.position,
          description: admin.description,
          profile_image: admin.profile_image,
          isActive: admin.isActive,
          lastLogin: admin.lastLogin,
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
    const { page = 1, limit = 10, role, search, sortBy = "createdAt", sortOrder = "DESC" } = req.query;

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
        { full_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { position: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
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
    const { full_name, email, phone, position, description, role, isActive, profile_image_path, whatsapp_link, google_link, twitter_link, facebook_link } = req.body;

    const admin = await AdminUser.findByPk(id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Store old values for audit
    const oldValues = {
      full_name: admin.full_name,
      email: admin.email,
      phone: admin.phone,
      position: admin.position,
      description: admin.description,
      role: admin.role,
      isActive: admin.isActive,
    };

    // Handle profile image
    let profileImagePath = admin.profile_image; // Keep existing by default
    
    if (req.file) {
      // New file uploaded - convert to relative path
      profileImagePath = convertToRelativePath(req.file.path);
    } else if (profile_image_path) {
      // Using existing relative path
      profileImagePath = profile_image_path;
    }

    // Prepare update data
    const updateData = {
      full_name: full_name || admin.full_name,
      email: email || admin.email,
      phone: phone || admin.phone,
      position: position || admin.position,
      description: description !== undefined ? description : admin.description,
      role: role || admin.role,
      isActive: isActive !== undefined ? isActive : admin.isActive,
      profile_image: profileImagePath,
      whatsapp_link: whatsapp_link !== undefined ? (whatsapp_link?.trim() || null) : admin.whatsapp_link,
      google_link: google_link !== undefined ? (google_link?.trim() || null) : admin.google_link,
      twitter_link: twitter_link !== undefined ? (twitter_link?.trim() || null) : admin.twitter_link,
      facebook_link: facebook_link !== undefined ? (facebook_link?.trim() || null) : admin.facebook_link,
    };

    await admin.update(updateData);

    // Log audit trail
    await logUpdate(
      req.user?.id || id,
      "admin_user",
      id,
      oldValues,
      updateData,
      req,
      `Updated admin profile: ${admin.full_name}`
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        id: admin.id,
        full_name: admin.full_name,
        email: admin.email,
        phone: admin.phone,
        position: admin.position,
        description: admin.description,
        role: admin.role,
        isActive: admin.isActive,
        profile_image: admin.profile_image,
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
    const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
    if (!isPasswordValid) {
      // Log failed password change attempt
      await logAudit({
        user_id: req.user?.id || id,
        action: "password_change_failed",
        resource_type: "admin_user",
        resource_id: id,
        description: `Failed password change attempt: incorrect current password`,
        ip_address: req.headers["x-forwarded-for"]?.split(",")[0] || req.ip,
        user_agent: req.headers["user-agent"],
        status: "failed",
        error_message: "Current password is incorrect",
      });
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await admin.update({ password: hashedPassword });

    // Log successful password change
    await logAudit({
      user_id: req.user?.id || id,
      action: "password_change",
      resource_type: "admin_user",
      resource_id: id,
      description: `Password changed successfully for ${admin.full_name}`,
      ip_address: req.headers["x-forwarded-for"]?.split(",")[0] || req.ip,
      user_agent: req.headers["user-agent"],
      status: "success",
    });

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

    // Log audit trail
    await logUpdate(
      req.user?.id,
      "admin_user",
      id,
      { role: oldRole },
      { role },
      req,
      `Updated admin role from ${oldRole} to ${role} for ${admin.full_name}`
    );

    res.status(200).json({
      success: true,
      message: "Admin role updated successfully",
      data: {
        id: admin.id,
        full_name: admin.full_name,
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

    const oldStatus = admin.isActive;
    await admin.update({ isActive: !admin.isActive });

    // Log audit trail
    await logStatusChange(
      req.user?.id,
      "admin_user",
      id,
      oldStatus ? "active" : "inactive",
      admin.isActive ? "active" : "inactive",
      req,
      `${admin.isActive ? "Activated" : "Deactivated"} admin: ${admin.full_name}`
    );

    res.status(200).json({
      success: true,
      message: `Admin ${admin.isActive ? "activated" : "deactivated"} successfully`,
      data: {
        id: admin.id,
        full_name: admin.full_name,
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
      full_name: admin.full_name,
      email: admin.email,
      role: admin.role,
    };

    await admin.destroy();

    // Log audit trail
    await logDelete(
      req.user?.id,
      "admin_user",
      id,
      adminData,
      req,
      `Deleted admin: ${adminData.full_name} (${adminData.email})`
    );

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
    const { page = 1, limit = 10, role, search, sortBy = "createdAt", sortOrder = "DESC" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build filter conditions - only show active admins
    const whereClause = { isActive: true };

    if (role) {
      whereClause.role = role;
    }

    if (search) {
      whereClause[Op.or] = [
        { full_name: { [Op.like]: `%${search}%` } },
        { position: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await AdminUser.findAndCountAll({
      where: whereClause,
      attributes: ["id", "full_name", "position", "description", "role", "profile_image", "whatsapp_link", "google_link", "twitter_link", "facebook_link", "createdAt"],
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
      where: { id, isActive: true },
      attributes: ["id", "full_name", "position", "description", "role", "profile_image", "whatsapp_link", "google_link", "twitter_link", "facebook_link", "createdAt"],
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
    const activeAdmins = await AdminUser.count({ where: { isActive: true } });
    
    const totalProjects = await Project.count();
    const projectsByStatus = await Project.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["status"],
      raw: true,
    });

    const totalInquiries = await Inquiry.count();
    const inquiriesByCategory = await Inquiry.findAll({
      attributes: [
        "category",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["category"],
      raw: true,
    });

    const totalDocuments = await Document.count();

    // Get recent activities
    const recentProjects = await Project.findAll({
      limit: 5,
      order: [["createdAt", "DESC"]],
      attributes: ["id", "name", "status", "category", "createdAt"],
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["full_name"],
        },
      ],
    });

    const recentInquiries = await Inquiry.findAll({
      limit: 5,
      order: [["createdAt", "DESC"]],
      attributes: ["id", "full_name", "email", "category", "createdAt"],
    });

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalAdmins,
          activeAdmins,
          totalProjects,
          totalInquiries,
          totalDocuments,
        },
        projectsByStatus,
        inquiriesByCategory,
        recentActivities: {
          recentProjects,
          recentInquiries,
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
};
