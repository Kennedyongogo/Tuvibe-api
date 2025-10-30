const { Project, AdminUser, sequelize } = require("../models");
const { Op } = require("sequelize");
const { convertToRelativePath } = require("../utils/filePath");
const {
  logCreate,
  logUpdate,
  logDelete,
  logStatusChange,
} = require("../utils/auditLogger");

// Create project
const createProject = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      county,
      subcounty,
      target_individual,
      status,
      assigned_to,
      start_date,
      end_date,
      longitude,
      latitude,
      progress,
    } = req.body;

    // created_by will be the authenticated admin user
    const created_by = req.user?.id;

    // Validate required fields
    if (!name || !description || !category || !county) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields (name, description, category, county)",
      });
    }

    // Create project
    const project = await Project.create({
      name,
      description,
      category,
      county,
      subcounty,
      target_individual,
      status: status || "pending",
      created_by,
      assigned_by: assigned_to ? req.user?.id : null,
      assigned_to,
      start_date,
      end_date,
      longitude,
      latitude,
      progress: progress || 0,
      update_images: [],
      progress_descriptions: [],
      updated_by: [],
    });

    // Log audit trail
    await logCreate(
      created_by,
      "project",
      project.id,
      { name, category, county, status: project.status },
      req,
      `Created new project: ${name}`
    );

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: project,
    });
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({
      success: false,
      message: "Error creating project",
      error: error.message,
    });
  }
};

// Get all projects with pagination and filters
const getAllProjects = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      county,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;

    // Build filter conditions
    const whereClause = {};

    if (category) {
      whereClause.category = category;
    }

    if (status) {
      whereClause.status = status;
    }

    if (county) {
      whereClause.county = county;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { target_individual: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Project.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: AdminUser,
          as: "assignee",
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
    console.error("Error fetching projects:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching projects",
      error: error.message,
    });
  }
};

// Get single project by ID
const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findByPk(id, {
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "full_name", "email", "phone"],
        },
        {
          model: AdminUser,
          as: "assigner",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: AdminUser,
          as: "assignee",
          attributes: ["id", "full_name", "email", "phone"],
        },
      ],
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Populate updated_by array with full user objects
    const projectData = project.toJSON();
    if (projectData.updated_by && Array.isArray(projectData.updated_by) && projectData.updated_by.length > 0) {
      // Handle both old format (just IDs) and new format (objects with user_id and timestamp)
      const userIds = projectData.updated_by.map(item => 
        typeof item === 'string' ? item : item.user_id
      );
      
      // Get unique user IDs
      const uniqueUserIds = [...new Set(userIds)];
      
      const updatedByUsers = await AdminUser.findAll({
        where: {
          id: uniqueUserIds
        },
        attributes: ["id", "full_name", "email", "phone"]
      });
      
      // Create a map for quick lookup
      const userMap = {};
      updatedByUsers.forEach(user => {
        userMap[user.id] = user;
      });
      
      // Map each update to include full user details and timestamp
      projectData.updated_by = projectData.updated_by.map(item => {
        const userId = typeof item === 'string' ? item : item.user_id;
        const timestamp = typeof item === 'object' ? item.timestamp : null;
        
        return {
          ...userMap[userId]?.toJSON(),
          timestamp
        };
      }).filter(item => item.id); // Remove any entries where user wasn't found
    }

    res.status(200).json({
      success: true,
      data: projectData,
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching project",
      error: error.message,
    });
  }
};

// Update project
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    // Extract data from both req.body and req.fields (for multer.fields())
    const bodyData = req.body || {};
    const fieldsData = req.fields || {};
    const allData = { ...bodyData, ...fieldsData };
    
    const {
      name,
      description,
      category,
      county,
      subcounty,
      target_individual,
      status,
      assigned_to,
      start_date,
      end_date,
      longitude,
      latitude,
      progress,
      progress_description,
      existing_images,
    } = allData;

    const project = await Project.findByPk(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const updated_by_user_id = req.user?.id;

    // Store old values for audit
    const oldValues = {
      name: project.name,
      status: project.status,
      category: project.category,
      progress: project.progress,
      assigned_to: project.assigned_to,
    };

    // Prepare update data - only include fields that are provided
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (county !== undefined) updateData.county = county;
    if (subcounty !== undefined) updateData.subcounty = subcounty;
    if (target_individual !== undefined) updateData.target_individual = target_individual;
    if (status !== undefined) updateData.status = status;
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
    if (start_date !== undefined) updateData.start_date = start_date;
    if (end_date !== undefined) updateData.end_date = end_date;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (progress !== undefined) updateData.progress = progress;

    // Set assigned_by when assignment changes
    if (assigned_to !== undefined && assigned_to !== project.assigned_to) {
      updateData.assigned_by = assigned_to ? req.user?.id : null;
    }

    // Handle progress description
    if (progress_description) {
      const descriptions = Array.isArray(project.progress_descriptions) 
        ? [...project.progress_descriptions] 
        : [];
      descriptions.push({
        description: progress_description,
        timestamp: new Date(),
        updated_by: updated_by_user_id,
      });
      updateData.progress_descriptions = descriptions;
      // Mark as changed for Sequelize
      project.changed('progress_descriptions', true);
    }

    // Handle update_images
    let imageArray = [];
    
    // Add existing images
    if (existing_images) {
      if (Array.isArray(existing_images)) {
        imageArray = existing_images.map(path => ({ path, timestamp: new Date() }));
      } else {
        imageArray = [{ path: existing_images, timestamp: new Date() }];
      }
    }

    // Add new uploaded images (from any field)
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => ({
        path: convertToRelativePath(file.path),
        timestamp: new Date()
      }));
      imageArray = [...imageArray, ...newImages];
    }

    if (imageArray.length > 0) {
      updateData.update_images = imageArray;
    }

    // Track who updated the project (with timestamp for each update)
    if (updated_by_user_id) {
      const updatedByArray = Array.isArray(project.updated_by) 
        ? [...project.updated_by] 
        : [];
      
      // Add user ID with timestamp for this update
      updatedByArray.push({
        user_id: updated_by_user_id,
        timestamp: new Date()
      });
      
      updateData.updated_by = updatedByArray;
      // Mark as changed for Sequelize
      project.changed('updated_by', true);
    }

    // Update project
    await project.update(updateData);

    // Log audit trail
    await logUpdate(
      updated_by_user_id,
      "project",
      id,
      oldValues,
      updateData,
      req,
      `Updated project: ${project.name}`
    );

    // Fetch updated project with associations
    const updatedProject = await Project.findByPk(id, {
      include: [
        { association: 'creator', attributes: ['id', 'full_name', 'email', 'phone'] },
        { association: 'assigner', attributes: ['id', 'full_name', 'email', 'phone'] },
        { association: 'assignee', attributes: ['id', 'full_name', 'email', 'phone'] }
      ]
    });

    res.status(200).json({
      success: true,
      message: "Project updated successfully",
      data: updatedProject,
    });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({
      success: false,
      message: "Error updating project",
      error: error.message,
    });
  }
};

// Update project status with progress tracking
const updateProjectStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, progress, progress_description, image_path } = req.body;

    const project = await Project.findByPk(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const updated_by_user_id = req.user?.id;
    const oldStatus = project.status;

    // Prepare update data
    const updateData = { status };

    if (progress !== undefined) {
      updateData.progress = progress;
    }

    // Add to progress descriptions array
    if (progress_description) {
      const descriptions = project.progress_descriptions || [];
      descriptions.push({
        description: progress_description,
        timestamp: new Date(),
        updated_by: updated_by_user_id,
      });
      updateData.progress_descriptions = descriptions;
    }

    // Add to update images array
    if (image_path) {
      const images = project.update_images || [];
      images.push({
        path: image_path,
        timestamp: new Date(),
        updated_by: updated_by_user_id,
      });
      updateData.update_images = images;
    }

    // Add to updated_by array
    const updatedByList = project.updated_by || [];
    updatedByList.push({
      user_id: updated_by_user_id,
      timestamp: new Date(),
      action: `Status changed to ${status}`,
    });
    updateData.updated_by = updatedByList;

    // Update project
    await project.update(updateData);

    // Log audit trail
    await logStatusChange(
      updated_by_user_id,
      "project",
      id,
      oldStatus,
      status,
      req,
      `Changed project status from ${oldStatus} to ${status} for: ${project.name}`
    );

    res.status(200).json({
      success: true,
      message: "Project status updated successfully",
      data: project,
    });
  } catch (error) {
    console.error("Error updating project status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating project status",
      error: error.message,
    });
  }
};

// Delete project
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findByPk(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Store project data for audit log
    const projectData = {
      name: project.name,
      category: project.category,
      status: project.status,
    };

    await project.destroy();

    // Log audit trail
    await logDelete(
      req.user?.id,
      "project",
      id,
      projectData,
      req,
      `Deleted project: ${projectData.name}`
    );

    res.status(200).json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting project",
      error: error.message,
    });
  }
};

// Get project statistics
const getProjectStats = async (req, res) => {
  try {
    const totalProjects = await Project.count();
    const projectsByStatus = await Project.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["status"],
    });

    const projectsByCategory = await Project.findAll({
      attributes: [
        "category",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["category"],
    });

    res.status(200).json({
      success: true,
      data: {
        total: totalProjects,
        byStatus: projectsByStatus,
        byCategory: projectsByCategory,
      },
    });
  } catch (error) {
    console.error("Error fetching project stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching project statistics",
      error: error.message,
    });
  }
};

// Get all projects for public users (no authentication required)
const getPublicProjects = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      county,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;

    // Build filter conditions
    const whereClause = {};

    if (category) {
      whereClause.category = category;
    }

    if (status) {
      whereClause.status = status;
    }

    if (county) {
      whereClause.county = county;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { target_individual: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Project.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "full_name"],
        },
        {
          model: AdminUser,
          as: "assignee",
          attributes: ["id", "full_name"],
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
    console.error("Error fetching public projects:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching projects",
      error: error.message,
    });
  }
};

// Get single project by ID for public users (no authentication required)
const getPublicProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findByPk(id, {
      include: [
        {
          model: AdminUser,
          as: "creator",
          attributes: ["id", "full_name"],
        },
        {
          model: AdminUser,
          as: "assignee",
          attributes: ["id", "full_name"],
        },
      ],
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error("Error fetching public project:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching project",
      error: error.message,
    });
  }
};

module.exports = {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  updateProjectStatus,
  deleteProject,
  getProjectStats,
  getPublicProjects,
  getPublicProjectById,
};

