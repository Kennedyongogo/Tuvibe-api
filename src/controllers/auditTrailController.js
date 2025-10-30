const { AuditTrail, AdminUser, sequelize } = require("../models");
const { Op } = require("sequelize");

// Get all audit logs with pagination and filters
const getAllAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      action,
      resource_type,
      user_id,
      status,
      startDate,
      endDate,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;

    // Build filter conditions
    const whereClause = {};

    if (action) {
      whereClause.action = action;
    }

    if (resource_type) {
      whereClause.resource_type = resource_type;
    }

    if (user_id) {
      whereClause.user_id = user_id;
    }

    if (status) {
      whereClause.status = status;
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereClause.createdAt[Op.lte] = new Date(endDate);
      }
    }

    if (search) {
      whereClause[Op.or] = [
        { description: { [Op.like]: `%${search}%` } },
        { ip_address: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await AuditTrail.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: AdminUser,
          as: "user",
          attributes: ["id", "full_name", "email"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching audit logs",
      error: error.message,
    });
  }
};

// Get single audit log by ID
const getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const auditLog = await AuditTrail.findByPk(id, {
      include: [
        {
          model: AdminUser,
          as: "user",
          attributes: ["id", "full_name", "email", "role"],
        },
      ],
    });

    if (!auditLog) {
      return res.status(404).json({
        success: false,
        message: "Audit log not found",
      });
    }

    res.status(200).json({
      success: true,
      data: auditLog,
    });
  } catch (error) {
    console.error("Error fetching audit log:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching audit log",
      error: error.message,
    });
  }
};

// Get audit logs for a specific resource
const getResourceAuditLogs = async (req, res) => {
  try {
    const { resource_type, resource_id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

    const { count, rows } = await AuditTrail.findAndCountAll({
      where: {
        resource_type,
        resource_id,
      },
      include: [
        {
          model: AdminUser,
          as: "user",
          attributes: ["id", "full_name", "email"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching resource audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching resource audit logs",
      error: error.message,
    });
  }
};

// Get audit logs for a specific user
const getUserAuditLogs = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { page = 1, limit = 20, action, resource_type } = req.query;

    const offset = (page - 1) * limit;

    const whereClause = { user_id };

    if (action) {
      whereClause.action = action;
    }

    if (resource_type) {
      whereClause.resource_type = resource_type;
    }

    const { count, rows } = await AuditTrail.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: AdminUser,
          as: "user",
          attributes: ["id", "full_name", "email", "role"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching user audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user audit logs",
      error: error.message,
    });
  }
};

// Get audit statistics
const getAuditStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const whereClause = {};

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereClause.createdAt[Op.lte] = new Date(endDate);
      }
    }

    // Total logs
    const totalLogs = await AuditTrail.count({ where: whereClause });

    // Logs by action
    const logsByAction = await AuditTrail.findAll({
      attributes: [
        "action",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: whereClause,
      group: ["action"],
      order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
    });

    // Logs by resource type
    const logsByResourceType = await AuditTrail.findAll({
      attributes: [
        "resource_type",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: whereClause,
      group: ["resource_type"],
      order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
    });

    // Logs by status
    const logsByStatus = await AuditTrail.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: whereClause,
      group: ["status"],
    });

    // Most active users
    const mostActiveUsers = await AuditTrail.findAll({
      attributes: [
        "user_id",
        [sequelize.fn("COUNT", sequelize.col("id")), "activityCount"],
      ],
      where: whereClause,
      include: [
        {
          model: AdminUser,
          as: "user",
          attributes: ["id", "full_name", "email"],
        },
      ],
      group: ["user_id"],
      order: [[sequelize.fn("COUNT", sequelize.col("id")), "DESC"]],
      limit: 10,
    });

    // Recent failed actions
    const recentFailures = await AuditTrail.findAll({
      where: {
        ...whereClause,
        status: "failed",
      },
      include: [
        {
          model: AdminUser,
          as: "user",
          attributes: ["id", "full_name", "email"],
        },
      ],
      limit: 10,
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: {
        totalLogs,
        logsByAction,
        logsByResourceType,
        logsByStatus,
        mostActiveUsers,
        recentFailures,
      },
    });
  } catch (error) {
    console.error("Error fetching audit stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching audit statistics",
      error: error.message,
    });
  }
};

// Export audit logs (for reporting)
const exportAuditLogs = async (req, res) => {
  try {
    const { startDate, endDate, format = "json" } = req.query;

    const whereClause = {};

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereClause.createdAt[Op.lte] = new Date(endDate);
      }
    }

    const auditLogs = await AuditTrail.findAll({
      where: whereClause,
      include: [
        {
          model: AdminUser,
          as: "user",
          attributes: ["id", "full_name", "email", "role"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (format === "json") {
      res.status(200).json({
        success: true,
        data: auditLogs,
        count: auditLogs.length,
      });
    } else if (format === "csv") {
      // Simple CSV export
      const csv = [
        "ID,Date,User,Action,Resource Type,Resource ID,Description,Status,IP Address",
        ...auditLogs.map((log) =>
          [
            log.id,
            log.createdAt,
            log.user?.full_name || "System",
            log.action,
            log.resource_type,
            log.resource_id || "",
            `"${log.description.replace(/"/g, '""')}"`,
            log.status,
            log.ip_address || "",
          ].join(",")
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=audit_logs_${Date.now()}.csv`
      );
      res.status(200).send(csv);
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid format. Use 'json' or 'csv'",
      });
    }
  } catch (error) {
    console.error("Error exporting audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Error exporting audit logs",
      error: error.message,
    });
  }
};

module.exports = {
  getAllAuditLogs,
  getAuditLogById,
  getResourceAuditLogs,
  getUserAuditLogs,
  getAuditStats,
  exportAuditLogs,
};

