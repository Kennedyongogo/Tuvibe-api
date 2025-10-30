const {
  Inquiry,
  Project,
  Document,
  AdminUser,
  AuditTrail,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");

// Define all possible enum values
const INQUIRY_STATUSES = ["pending", "in_progress", "resolved"];
const INQUIRY_CATEGORIES = ["volunteer", "education", "mental_health", "community", "donation", "partnership"];
const PROJECT_STATUSES = ["pending", "in_progress", "on_hold", "completed"];
const PROJECT_CATEGORIES = ["volunteer", "education", "mental_health", "community", "donation", "partnership"];

// Helper function to ensure all enum values are present
const normalizeStats = (stats, enumValues, key) => {
  const statsMap = stats.reduce((acc, item) => {
    acc[item[key]] = item.count;
    return acc;
  }, {});

  return enumValues.map(value => ({
    [key]: value,
    count: parseInt(statsMap[value] || 0)
  }));
};

// Get comprehensive system analytics
const getSystemAnalytics = async (req, res) => {
  try {
    console.log("Fetching system analytics...");

    // Inquiries Statistics
    const totalInquiries = await Inquiry.count();
    const inquiriesByStatus = await Inquiry.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["status"],
      raw: true,
    });

    const inquiriesByCategory = await Inquiry.findAll({
      attributes: [
        "category",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["category"],
      raw: true,
    });

    // Projects Statistics
    const totalProjects = await Project.count();
    const projectsByStatus = await Project.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["status"],
      raw: true,
    });

    const projectsByCategory = await Project.findAll({
      attributes: [
        "category",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["category"],
      raw: true,
    });

    const projectsByCounty = await Project.findAll({
      attributes: [
        "county",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["county"],
      order: [[sequelize.literal("count"), "DESC"]],
      limit: 10,
      raw: true,
    });

    const averageProgress = await Project.findOne({
      attributes: [[sequelize.fn("AVG", sequelize.col("progress")), "average"]],
      raw: true,
    });

    // Documents Statistics
    const totalDocuments = await Document.count();
    const documentsByType = await Document.findAll({
      attributes: [
        "file_type",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["file_type"],
      raw: true,
    });

    // Users Statistics
    const totalUsers = await AdminUser.count();
    const activeUsers = await AdminUser.count({
      where: { isActive: true },
    });

    const usersByRole = await AdminUser.findAll({
      attributes: [
        "role",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["role"],
      raw: true,
    });

    // Audit Trail Statistics (last 7 days activity)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivities = await AuditTrail.count({
      where: {
        createdAt: {
          [Op.gte]: sevenDaysAgo,
        },
      },
    });

    const activitiesByAction = await AuditTrail.findAll({
      attributes: [
        "action",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: {
        createdAt: {
          [Op.gte]: sevenDaysAgo,
        },
      },
      group: ["action"],
      raw: true,
    });

    // Recent trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentInquiries = await Inquiry.count({
      where: {
        createdAt: {
          [Op.gte]: thirtyDaysAgo,
        },
      },
    });

    const recentProjects = await Project.count({
      where: {
        createdAt: {
          [Op.gte]: thirtyDaysAgo,
        },
      },
    });

    const recentDocuments = await Document.count({
      where: {
        createdAt: {
          [Op.gte]: thirtyDaysAgo,
        },
      },
    });

    // Completed projects (last 30 days)
    const recentCompletedProjects = await Project.count({
      where: {
        status: "completed",
        updatedAt: {
          [Op.gte]: thirtyDaysAgo,
        },
      },
    });

    // Resolved inquiries (last 30 days)
    const recentResolvedInquiries = await Inquiry.count({
      where: {
        status: "resolved",
        updatedAt: {
          [Op.gte]: thirtyDaysAgo,
        },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalInquiries,
          totalProjects,
          totalDocuments,
          totalUsers,
          activeUsers,
        },
        inquiries: {
          total: totalInquiries,
          byStatus: normalizeStats(inquiriesByStatus, INQUIRY_STATUSES, "status"),
          byCategory: normalizeStats(inquiriesByCategory, INQUIRY_CATEGORIES, "category"),
          recent: recentInquiries,
          recentResolved: recentResolvedInquiries,
        },
        projects: {
          total: totalProjects,
          byStatus: normalizeStats(projectsByStatus, PROJECT_STATUSES, "status"),
          byCategory: normalizeStats(projectsByCategory, PROJECT_CATEGORIES, "category"),
          byCounty: projectsByCounty,
          averageProgress: parseFloat(averageProgress?.average || 0).toFixed(2),
          recent: recentProjects,
          recentCompleted: recentCompletedProjects,
        },
        documents: {
          total: totalDocuments,
          byType: documentsByType,
          recent: recentDocuments,
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          byRole: usersByRole,
        },
        activity: {
          last7Days: recentActivities,
          byAction: activitiesByAction,
        },
        trends: {
          last30Days: {
            inquiries: recentInquiries,
            projects: recentProjects,
            documents: recentDocuments,
            completedProjects: recentCompletedProjects,
            resolvedInquiries: recentResolvedInquiries,
          },
        },
      },
    });
  } catch (error) {
    console.error("Error fetching system analytics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching system analytics",
      error: error.message,
    });
  }
};

// Get inquiry-specific analytics with time range
const getInquiryAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    console.log("Fetching inquiry analytics...");

    const whereClause = {};
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    }

    const totalInquiries = await Inquiry.count({ where: whereClause });

    const byStatus = await Inquiry.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: whereClause,
      group: ["status"],
      raw: true,
    });

    const byCategory = await Inquiry.findAll({
      attributes: [
        "category",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: whereClause,
      group: ["category"],
      raw: true,
    });

    // Response time analysis (average time to resolve)
    // Calculate resolution time on the application side to be database-agnostic
    const resolvedInquiries = await Inquiry.findAll({
      attributes: ["createdAt", "updatedAt"],
      where: {
        ...whereClause,
        status: "resolved",
      },
      raw: true,
    });

    let avgResolutionTimeHours = 0;
    if (resolvedInquiries.length > 0) {
      const totalHours = resolvedInquiries.reduce((sum, inquiry) => {
        const created = new Date(inquiry.createdAt);
        const updated = new Date(inquiry.updatedAt);
        const hours = (updated - created) / (1000 * 60 * 60); // Convert milliseconds to hours
        return sum + hours;
      }, 0);
      avgResolutionTimeHours = totalHours / resolvedInquiries.length;
    }

    res.status(200).json({
      success: true,
      data: {
        total: totalInquiries,
        byStatus: normalizeStats(byStatus, INQUIRY_STATUSES, "status"),
        byCategory: normalizeStats(byCategory, INQUIRY_CATEGORIES, "category"),
        averageResolutionTimeHours: parseFloat(avgResolutionTimeHours).toFixed(2),
      },
    });
  } catch (error) {
    console.error("Error fetching inquiry analytics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching inquiry analytics",
      error: error.message,
    });
  }
};

// Get project-specific analytics with time range
const getProjectAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    console.log("Fetching project analytics...");

    const whereClause = {};
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    }

    const totalProjects = await Project.count({ where: whereClause });

    const byStatus = await Project.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: whereClause,
      group: ["status"],
      raw: true,
    });

    const byCategory = await Project.findAll({
      attributes: [
        "category",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: whereClause,
      group: ["category"],
      raw: true,
    });

    const byCounty = await Project.findAll({
      attributes: [
        "county",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: whereClause,
      group: ["county"],
      order: [[sequelize.literal("count"), "DESC"]],
      raw: true,
    });

    const progressStats = await Project.findOne({
      attributes: [
        [sequelize.fn("AVG", sequelize.col("progress")), "average"],
        [sequelize.fn("MIN", sequelize.col("progress")), "minimum"],
        [sequelize.fn("MAX", sequelize.col("progress")), "maximum"],
      ],
      where: whereClause,
      raw: true,
    });

    // Project completion rate
    const completedProjects = await Project.count({
      where: {
        ...whereClause,
        status: "completed",
      },
    });

    const completionRate =
      totalProjects > 0
        ? ((completedProjects / totalProjects) * 100).toFixed(2)
        : 0;

    res.status(200).json({
      success: true,
      data: {
        total: totalProjects,
        byStatus: normalizeStats(byStatus, PROJECT_STATUSES, "status"),
        byCategory: normalizeStats(byCategory, PROJECT_CATEGORIES, "category"),
        byCounty,
        progress: {
          average: parseFloat(progressStats?.average || 0).toFixed(2),
          minimum: progressStats?.minimum || 0,
          maximum: progressStats?.maximum || 0,
        },
        completionRate: `${completionRate}%`,
        completedProjects,
      },
    });
  } catch (error) {
    console.error("Error fetching project analytics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching project analytics",
      error: error.message,
    });
  }
};

// Get monthly trends for charts
const getMonthlyTrends = async (req, res) => {
  try {
    const { months = 6 } = req.query;

    console.log(`Fetching ${months} months trend data...`);

    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - parseInt(months));

    // Fetch all records and group on application side to be database-agnostic
    const inquiries = await Inquiry.findAll({
      attributes: ["createdAt"],
      where: {
        createdAt: {
          [Op.gte]: monthsAgo,
        },
      },
      raw: true,
    });

    const projects = await Project.findAll({
      attributes: ["createdAt"],
      where: {
        createdAt: {
          [Op.gte]: monthsAgo,
        },
      },
      raw: true,
    });

    const documents = await Document.findAll({
      attributes: ["createdAt"],
      where: {
        createdAt: {
          [Op.gte]: monthsAgo,
        },
      },
      raw: true,
    });

    // Helper function to group by month
    const groupByMonth = (records) => {
      const grouped = {};
      records.forEach((record) => {
        const date = new Date(record.createdAt);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        grouped[month] = (grouped[month] || 0) + 1;
      });
      return Object.entries(grouped)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month));
    };

    res.status(200).json({
      success: true,
      data: {
        inquiries: groupByMonth(inquiries),
        projects: groupByMonth(projects),
        documents: groupByMonth(documents),
      },
    });
  } catch (error) {
    console.error("Error fetching monthly trends:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching monthly trends",
      error: error.message,
    });
  }
};

module.exports = {
  getSystemAnalytics,
  getInquiryAnalytics,
  getProjectAnalytics,
  getMonthlyTrends,
};

