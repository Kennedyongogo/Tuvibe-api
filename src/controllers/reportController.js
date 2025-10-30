const { Project, Inquiry, Document, AdminUser, AuditTrail, sequelize } = require("../models");
const { Op } = require("sequelize");
const { generatePDFReport, generateWordReport } = require("../utils/reportGenerator");
const { logAudit } = require("../utils/auditLogger");

// Get report data based on date range
const getReportData = async (req, res) => {
  try {
    const { startDate, endDate, reportType = "all" } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Please provide both startDate and endDate",
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const dateRange = {
      [Op.between]: [start, end],
    };

    // Collect all data
    const reportData = {
      dateRange: { start, end },
      summary: {},
      projects: [],
      inquiries: [],
      documents: [],
      activities: [],
    };

    // Get project data
    if (reportType === "all" || reportType === "projects") {
      const projects = await Project.findAll({
        where: { createdAt: dateRange },
        include: [
          {
            model: AdminUser,
            as: "creator",
            attributes: ["full_name", "email"],
          },
          {
            model: AdminUser,
            as: "assignee",
            attributes: ["full_name", "email"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      const projectStats = await Project.findAll({
        attributes: [
          "status",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        where: { createdAt: dateRange },
        group: ["status"],
        raw: true,
      });

      reportData.projects = projects;
      reportData.summary.projects = {
        total: projects.length,
        byStatus: projectStats,
      };
    }

    // Get inquiry data
    if (reportType === "all" || reportType === "inquiries") {
      const inquiries = await Inquiry.findAll({
        where: { createdAt: dateRange },
        order: [["createdAt", "DESC"]],
      });

      const inquiryStats = await Inquiry.findAll({
        attributes: [
          "status",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        where: { createdAt: dateRange },
        group: ["status"],
        raw: true,
      });

      const inquiryCategoryStats = await Inquiry.findAll({
        attributes: [
          "category",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        where: { createdAt: dateRange },
        group: ["category"],
        raw: true,
      });

      reportData.inquiries = inquiries;
      reportData.summary.inquiries = {
        total: inquiries.length,
        byStatus: inquiryStats,
        byCategory: inquiryCategoryStats,
      };
    }

    // Get document data
    if (reportType === "all" || reportType === "documents") {
      const documents = await Document.findAll({
        where: { createdAt: dateRange },
        include: [
          {
            model: AdminUser,
            as: "uploader",
            attributes: ["full_name", "email"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      const documentStats = await Document.findAll({
        attributes: [
          "file_type",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        where: { createdAt: dateRange },
        group: ["file_type"],
        raw: true,
      });

      reportData.documents = documents;
      reportData.summary.documents = {
        total: documents.length,
        byType: documentStats,
      };
    }

    // Get activity/audit trail data
    if (reportType === "all" || reportType === "activities") {
      const activities = await AuditTrail.findAll({
        where: { createdAt: dateRange },
        include: [
          {
            model: AdminUser,
            as: "user",
            attributes: ["full_name", "email"],
          },
        ],
        order: [["createdAt", "DESC"]],
        limit: 100, // Limit to recent 100 activities
      });

      const activityStats = await AuditTrail.findAll({
        attributes: [
          "action",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        where: { createdAt: dateRange },
        group: ["action"],
        raw: true,
      });

      reportData.activities = activities;
      reportData.summary.activities = {
        total: activities.length,
        byAction: activityStats,
      };
    }

    // Log audit trail for report data preview
    try {
      const userId = req.user?.id || req.user?.user_id;
      if (userId) {
        await logAudit({
          user_id: userId,
          action: 'export',
          resource_type: 'system',
          resource_id: null,
          description: `Previewed report data for ${startDate} to ${endDate} (${reportType})`,
          metadata: {
            reportType: 'DATA_PREVIEW',
            dateRange: {
              start: startDate,
              end: endDate
            },
            reportTypeFilter: reportType,
            dataCounts: {
              projects: reportData.projects?.length || 0,
              inquiries: reportData.inquiries?.length || 0,
              documents: reportData.documents?.length || 0,
              activities: reportData.activities?.length || 0
            }
          },
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.get('User-Agent')
        });
      }
    } catch (auditError) {
      // Don't fail the request if audit logging fails
    }

    res.status(200).json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating report data",
      error: error.message,
    });
  }
};

// Generate and download PDF report
const generatePDF = async (req, res) => {
  try {
    const { startDate, endDate, reportType = "all" } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Please provide both startDate and endDate",
      });
    }

    // Fetch report data
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const dateRange = { [Op.between]: [start, end] };

    // Collect data
    const reportData = await collectReportData(dateRange, reportType);
    
    // Add original dates for display in the report
    reportData.displayDateRange = {
      start: new Date(startDate),
      end: new Date(endDate)
    };

    // Generate PDF
    const pdfBuffer = await generatePDFReport(reportData);

    // Log audit trail for report generation
    try {
      const userId = req.user?.id || req.user?.user_id;
      if (userId) {
        await logAudit({
          user_id: userId,
          action: 'download',
          resource_type: 'system',
          resource_id: null,
          description: `Generated PDF report for ${startDate} to ${endDate} (${reportType})`,
          metadata: {
            reportType: 'PDF',
            dateRange: {
              start: startDate,
              end: endDate
            },
            reportTypeFilter: reportType,
            filename: `activity_report_${startDate}_to_${endDate}.pdf`
          },
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.get('User-Agent')
        });
      }
    } catch (auditError) {
      // Don't fail the request if audit logging fails
    }

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=activity_report_${startDate}_to_${endDate}.pdf`
    );

    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating PDF report",
      error: error.message,
    });
  }
};

// Generate and download Word report
const generateWord = async (req, res) => {
  try {
    const { startDate, endDate, reportType = "all" } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Please provide both startDate and endDate",
      });
    }

    // Fetch report data
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const dateRange = { [Op.between]: [start, end] };

    // Collect data
    const reportData = await collectReportData(dateRange, reportType);
    
    // Add original dates for display in the report
    reportData.displayDateRange = {
      start: new Date(startDate),
      end: new Date(endDate)
    };
    

    // Generate Word document
    const docBuffer = await generateWordReport(reportData);

    // Log audit trail for report generation
    try {
      const userId = req.user?.id || req.user?.user_id;
      if (userId) {
        await logAudit({
          user_id: userId,
          action: 'download',
          resource_type: 'system',
          resource_id: null,
          description: `Generated Word report for ${startDate} to ${endDate} (${reportType})`,
          metadata: {
            reportType: 'WORD',
            dateRange: {
              start: startDate,
              end: endDate
            },
            reportTypeFilter: reportType,
            filename: `activity_report_${startDate}_to_${endDate}.docx`
          },
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.get('User-Agent')
        });
      }
    } catch (auditError) {
      // Don't fail the request if audit logging fails
    }

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=activity_report_${startDate}_to_${endDate}.docx`
    );

    res.send(docBuffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating Word report",
      error: error.message,
    });
  }
};

// Helper function to collect report data
const collectReportData = async (dateRange, reportType) => {
  const data = {
    dateRange: {
      start: dateRange[Op.between][0],
      end: dateRange[Op.between][1],
    },
    summary: {},
    projects: [],
    inquiries: [],
    documents: [],
    activities: [],
  };

  // Projects
  if (reportType === "all" || reportType === "projects") {
    const projects = await Project.findAll({
      where: { createdAt: dateRange },
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["full_name", "email"],
        },
        {
          model: AdminUser,
          as: "assignee",
          attributes: ["full_name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const projectStats = await Project.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: { createdAt: dateRange },
      group: ["status"],
      raw: true,
    });

    data.projects = projects.map((p) => p.toJSON());
    data.summary.projects = {
      total: projects.length,
      byStatus: projectStats,
    };
  }

  // Inquiries
  if (reportType === "all" || reportType === "inquiries") {
    const inquiries = await Inquiry.findAll({
      where: { createdAt: dateRange },
      order: [["createdAt", "DESC"]],
    });

    const inquiryStats = await Inquiry.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: { createdAt: dateRange },
      group: ["status"],
      raw: true,
    });

    data.inquiries = inquiries.map((i) => i.toJSON());
    data.summary.inquiries = {
      total: inquiries.length,
      byStatus: inquiryStats,
    };
  }

  // Documents
  if (reportType === "all" || reportType === "documents") {
    const documents = await Document.findAll({
      where: { createdAt: dateRange },
      include: [
        {
          model: AdminUser,
          as: "uploader",
          attributes: ["full_name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    data.documents = documents.map((d) => d.toJSON());
    data.summary.documents = {
      total: documents.length,
    };
  }

  // Activities
  if (reportType === "all" || reportType === "activities") {
    const activities = await AuditTrail.findAll({
      where: { createdAt: dateRange },
      include: [
        {
          model: AdminUser,
          as: "user",
          attributes: ["full_name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 100,
    });

    data.activities = activities.map((a) => a.toJSON());
    data.summary.activities = {
      total: activities.length,
    };
  }

  return data;
};

// Get summary statistics for dashboard charts
const getSummaryStats = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = "day" } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Please provide both startDate and endDate",
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const dateRange = { [Op.between]: [start, end] };

    // Determine grouping function
    let dateGroupBy;
    switch (groupBy) {
      case "week":
        dateGroupBy = sequelize.fn("DATE_FORMAT", sequelize.col("createdAt"), "%Y-%u");
        break;
      case "month":
        dateGroupBy = sequelize.fn("DATE_FORMAT", sequelize.col("createdAt"), "%Y-%m");
        break;
      case "day":
      default:
        dateGroupBy = sequelize.fn("DATE", sequelize.col("createdAt"));
        break;
    }

    // Projects over time
    const projectsOverTime = await Project.findAll({
      attributes: [
        [dateGroupBy, "period"],
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: { createdAt: dateRange },
      group: [dateGroupBy],
      order: [[dateGroupBy, "ASC"]],
      raw: true,
    });

    // Inquiries over time
    const inquiriesOverTime = await Inquiry.findAll({
      attributes: [
        [dateGroupBy, "period"],
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: { createdAt: dateRange },
      group: [dateGroupBy],
      order: [[dateGroupBy, "ASC"]],
      raw: true,
    });

    // Activities over time
    const activitiesOverTime = await AuditTrail.findAll({
      attributes: [
        [dateGroupBy, "period"],
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: { createdAt: dateRange },
      group: [dateGroupBy],
      order: [[dateGroupBy, "ASC"]],
      raw: true,
    });

    res.status(200).json({
      success: true,
      data: {
        projectsOverTime,
        inquiriesOverTime,
        activitiesOverTime,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating summary statistics",
      error: error.message,
    });
  }
};

module.exports = {
  getReportData,
  generatePDF,
  generateWord,
  getSummaryStats,
};

