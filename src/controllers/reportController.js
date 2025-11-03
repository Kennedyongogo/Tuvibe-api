const {
  Report,
  PublicUser,
  AdminUser,
  Notification,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");

// Public user: Create a new report/complaint
exports.create = async (req, res) => {
  try {
    const { reported_user_id, category, subject, description, priority } =
      req.body;

    if (!category || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: "category, subject, and description are required",
      });
    }

    // Validate category
    const validCategories = [
      "inappropriate_content",
      "harassment",
      "scam",
      "fake_profile",
      "spam",
      "payment_issue",
      "technical_issue",
      "other",
    ];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category",
      });
    }

    // If reporting a user, verify they exist
    if (reported_user_id) {
      const reportedUser = await PublicUser.findByPk(reported_user_id);
      if (!reportedUser) {
        return res.status(404).json({
          success: false,
          message: "Reported user not found",
        });
      }
      // Prevent self-reporting
      if (reported_user_id === req.publicUserId) {
        return res.status(400).json({
          success: false,
          message: "Cannot report yourself",
        });
      }
    }

    const report = await Report.create({
      public_user_id: req.publicUserId,
      reported_user_id: reported_user_id || null,
      category,
      subject,
      description,
      priority: priority || "medium",
      status: "pending",
    });

    // Create notification for admins (optional - you can implement admin notifications separately)
    // For now, just return success

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      data: report,
    });
  } catch (err) {
    console.error("create report error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create report",
    });
  }
};

// Public user: Get their own reports
exports.listMine = async (req, res) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query;

    const where = { public_user_id: req.publicUserId };
    if (status) {
      where.status = status;
    }

    const limit = Math.min(Number(pageSize) || 20, 50);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await Report.findAndCountAll({
      where,
      include: [
        {
          model: PublicUser,
          as: "reportedUser",
          attributes: ["id", "name", "photo"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: Number(page),
        pageSize: limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("listMine reports error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
    });
  }
};

// Public user: Get single report details
exports.getMine = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await Report.findOne({
      where: {
        id,
        public_user_id: req.publicUserId,
      },
      include: [
        {
          model: PublicUser,
          as: "reportedUser",
          attributes: ["id", "name", "photo"],
          required: false,
        },
        {
          model: AdminUser,
          as: "handledBy",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    return res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    console.error("getMine report error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch report",
    });
  }
};

// Admin: Get all reports with filters
exports.listAll = async (req, res) => {
  try {
    const {
      status,
      category,
      priority,
      page = 1,
      pageSize = 10,
      q,
    } = req.query;

    const where = {};

    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;

    if (q) {
      where[Op.or] = [
        { subject: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const limit = Math.min(Number(pageSize) || 10, 50);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await Report.findAndCountAll({
      where,
      include: [
        {
          model: PublicUser,
          as: "reporter",
          attributes: ["id", "name", "email", "phone"],
          required: true,
        },
        {
          model: PublicUser,
          as: "reportedUser",
          attributes: ["id", "name", "email", "phone"],
          required: false,
        },
        {
          model: AdminUser,
          as: "handledBy",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
      order: [
        ["priority", "DESC"], // urgent > high > medium > low
        ["createdAt", "DESC"],
      ],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: Number(page),
        pageSize: limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("listAll reports error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
    });
  }
};

// Admin: Get single report details
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await Report.findByPk(id, {
      include: [
        {
          model: PublicUser,
          as: "reporter",
          attributes: { exclude: ["password", "otp"] },
          required: true,
        },
        {
          model: PublicUser,
          as: "reportedUser",
          attributes: { exclude: ["password", "otp"] },
          required: false,
        },
        {
          model: AdminUser,
          as: "handledBy",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    return res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    console.error("getOne report error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch report",
    });
  }
};

// Admin: Update report status and add notes
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, priority } = req.body;

    const report = await Report.findByPk(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    const updates = {};
    if (status) {
      const validStatuses = [
        "pending",
        "in_review",
        "resolved",
        "rejected",
        "closed",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }
      updates.status = status;

      // Set resolution date if resolved
      if (status === "resolved") {
        updates.resolution_date = new Date();
      }
    }

    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (priority) {
      const validPriorities = ["low", "medium", "high", "urgent"];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: "Invalid priority",
        });
      }
      updates.priority = priority;
    }

    // Assign admin if not already assigned
    if (!report.admin_id) {
      updates.admin_id = req.userId;
    }

    await report.update(updates);

    // Create notification for the reporter
    if (status && status !== report.status) {
      try {
        const statusMessages = {
          in_review: "Your report is now under review",
          resolved: "Your report has been resolved",
          rejected: "Your report has been reviewed and closed",
          closed: "Your report has been closed",
        };

        await Notification.create({
          public_user_id: report.public_user_id,
          title: "Report Status Update",
          message:
            statusMessages[status] ||
            `Your report status has been updated to ${status}`,
          isRead: false,
        });
      } catch (notifErr) {
        console.error("Failed to create notification:", notifErr);
      }
    }

    const updatedReport = await Report.findByPk(id, {
      include: [
        {
          model: PublicUser,
          as: "reporter",
          attributes: ["id", "name", "email"],
          required: true,
        },
        {
          model: PublicUser,
          as: "reportedUser",
          attributes: ["id", "name", "email"],
          required: false,
        },
        {
          model: AdminUser,
          as: "handledBy",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
    });

    return res.json({
      success: true,
      message: "Report updated successfully",
      data: updatedReport,
    });
  } catch (err) {
    console.error("update report error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update report",
    });
  }
};

// Admin: Delete a report
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await Report.findByPk(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    await report.destroy();

    return res.json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (err) {
    console.error("delete report error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete report",
    });
  }
};

// Admin: Get report statistics
exports.stats = async (req, res) => {
  try {
    const total = await Report.count();
    const byStatus = await Report.findAll({
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        "status",
      ],
      group: ["status"],
      raw: true,
    });

    const byCategory = await Report.findAll({
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        "category",
      ],
      group: ["category"],
      raw: true,
    });

    const byPriority = await Report.findAll({
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        "priority",
      ],
      group: ["priority"],
      raw: true,
    });

    const pending = await Report.count({ where: { status: "pending" } });
    const resolved = await Report.count({ where: { status: "resolved" } });

    return res.json({
      success: true,
      data: {
        total,
        pending,
        resolved,
        byStatus: byStatus.map((s) => ({
          status: s.status,
          count: parseInt(s.count),
        })),
        byCategory: byCategory.map((c) => ({
          category: c.category,
          count: parseInt(c.count),
        })),
        byPriority: byPriority.map((p) => ({
          priority: p.priority,
          count: parseInt(p.count),
        })),
      },
    });
  } catch (err) {
    console.error("report stats error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    });
  }
};
