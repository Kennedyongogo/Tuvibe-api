const { Testimony } = require("../models");
const { Op } = require("sequelize");
const {
  logCreate,
  logUpdate,
  logDelete,
  logStatusChange,
} = require("../utils/auditLogger");

// Create testimony
const createTestimony = async (req, res) => {
  try {
    const { name, rating, description, status } = req.body;

    // Validate required fields
    if (!name || !rating || !description) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields (name, rating, description)",
      });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Create testimony
    const testimony = await Testimony.create({
      name,
      rating,
      description,
      status: status || "pending",
    });

    // Log audit trail
    await logCreate(
      null, // No user ID for public testimonies
      "testimony",
      testimony.id,
      { name, rating, status: testimony.status },
      req,
      `Created new testimony from ${name} with rating ${rating}`
    );

    res.status(201).json({
      success: true,
      message: "Testimony created successfully",
      data: testimony,
    });
  } catch (error) {
    console.error("Error creating testimony:", error);
    res.status(500).json({
      success: false,
      message: "Error creating testimony",
      error: error.message,
    });
  }
};

// Get all testimonies with pagination and filters
const getAllTestimonies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      rating,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;

    // Build filter conditions
    const whereClause = {};

    if (status) {
      whereClause.status = status;
    }

    if (rating) {
      whereClause.rating = rating;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Testimony.findAndCountAll({
      where: whereClause,
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
    console.error("Error fetching testimonies:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching testimonies",
      error: error.message,
    });
  }
};

// Get single testimony by ID
const getTestimonyById = async (req, res) => {
  try {
    const { id } = req.params;

    const testimony = await Testimony.findByPk(id);

    if (!testimony) {
      return res.status(404).json({
        success: false,
        message: "Testimony not found",
      });
    }

    res.status(200).json({
      success: true,
      data: testimony,
    });
  } catch (error) {
    console.error("Error fetching testimony:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching testimony",
      error: error.message,
    });
  }
};

// Update testimony
const updateTestimony = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, rating, description, status } = req.body;

    const testimony = await Testimony.findByPk(id);

    if (!testimony) {
      return res.status(404).json({
        success: false,
        message: "Testimony not found",
      });
    }

    // Store old values for audit
    const oldValues = {
      name: testimony.name,
      rating: testimony.rating,
      description: testimony.description,
      status: testimony.status,
    };

    // Prepare update data - only include fields that are provided
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }
      updateData.rating = rating;
    }
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    // Update testimony
    await testimony.update(updateData);

    // Log audit trail
    await logUpdate(
      req.user?.id,
      "testimony",
      id,
      oldValues,
      updateData,
      req,
      `Updated testimony with ID: ${id}`
    );

    res.status(200).json({
      success: true,
      message: "Testimony updated successfully",
      data: testimony,
    });
  } catch (error) {
    console.error("Error updating testimony:", error);
    res.status(500).json({
      success: false,
      message: "Error updating testimony",
      error: error.message,
    });
  }
};

// Update testimony status
const updateTestimonyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const testimony = await Testimony.findByPk(id);

    if (!testimony) {
      return res.status(404).json({
        success: false,
        message: "Testimony not found",
      });
    }

    const oldStatus = testimony.status;

    // Validate status
    const validStatuses = ["pending", "approved", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be one of: pending, approved, rejected",
      });
    }

    // Update testimony status
    await testimony.update({ status });

    // Log audit trail
    await logStatusChange(
      req.user?.id,
      "testimony",
      id,
      oldStatus,
      status,
      req,
      `Changed testimony status from ${oldStatus} to ${status}`
    );

    res.status(200).json({
      success: true,
      message: "Testimony status updated successfully",
      data: testimony,
    });
  } catch (error) {
    console.error("Error updating testimony status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating testimony status",
      error: error.message,
    });
  }
};

// Delete testimony
const deleteTestimony = async (req, res) => {
  try {
    const { id } = req.params;

    const testimony = await Testimony.findByPk(id);

    if (!testimony) {
      return res.status(404).json({
        success: false,
        message: "Testimony not found",
      });
    }

    // Store testimony data for audit log
    const testimonyData = {
      name: testimony.name,
      rating: testimony.rating,
      status: testimony.status,
    };

    await testimony.destroy();

    // Log audit trail
    await logDelete(
      req.user?.id,
      "testimony",
      id,
      testimonyData,
      req,
      `Deleted testimony from ${testimonyData.name} with rating ${testimonyData.rating}`
    );

    res.status(200).json({
      success: true,
      message: "Testimony deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting testimony:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting testimony",
      error: error.message,
    });
  }
};

// Get approved testimonies for public display
const getApprovedTestimonies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      rating,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;

    // Build filter conditions - only approved testimonies
    const whereClause = { status: "approved" };

    if (rating) {
      whereClause.rating = rating;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Testimony.findAndCountAll({
      where: whereClause,
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
    console.error("Error fetching approved testimonies:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching testimonies",
      error: error.message,
    });
  }
};

module.exports = {
  createTestimony,
  getAllTestimonies,
  getTestimonyById,
  updateTestimony,
  updateTestimonyStatus,
  deleteTestimony,
  getApprovedTestimonies,
};
