const { RatingTestimonial, PublicUser } = require("../models");
const { Op } = require("sequelize");
const { getPremiumBadgeType } = require("../services/premiumBadgeService");

/**
 * Check if user should be prompted to rate and give testimonial
 * Returns true if:
 * - User hasn't submitted a rating/testimonial yet
 * - AND (has never dismissed OR 3+ days have passed since dismissal)
 */
exports.checkShouldPrompt = async (req, res) => {
  try {
    // Check if user has already submitted
    const existingRating = await RatingTestimonial.findOne({
      where: { public_user_id: req.publicUserId },
    });

    if (existingRating) {
      return res.json({
        success: true,
        data: {
          shouldPrompt: false,
          hasSubmitted: true,
          daysUntilNextPrompt: null,
        },
      });
    }

    // Get user to check dismissal timestamp
    const user = await PublicUser.findByPk(req.publicUserId, {
      attributes: ["rating_prompt_dismissed_at"],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let shouldPrompt = true;
    let daysUntilNextPrompt = null;

    // If user dismissed before, check if 3 days have passed
    if (user.rating_prompt_dismissed_at) {
      const dismissedAt = new Date(user.rating_prompt_dismissed_at);
      const now = new Date();
      const daysSinceDismissal = Math.floor(
        (now - dismissedAt) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceDismissal < 3) {
        shouldPrompt = false;
        daysUntilNextPrompt = 3 - daysSinceDismissal;
      }
    }

    return res.json({
      success: true,
      data: {
        shouldPrompt,
        hasSubmitted: false,
        daysUntilNextPrompt,
      },
    });
  } catch (err) {
    console.error("checkShouldPrompt error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to check prompt status",
    });
  }
};

/**
 * Submit rating and/or testimonial
 * Each user can only submit once (enforced by unique constraint)
 */
exports.submit = async (req, res) => {
  try {
    const { rating, testimonial } = req.body;

    // Validate rating
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating is required and must be between 1 and 5",
      });
    }

    // Check if user has already submitted
    const existingRating = await RatingTestimonial.findOne({
      where: { public_user_id: req.publicUserId },
    });

    if (existingRating) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted a rating and testimonial",
      });
    }

    // Create rating/testimonial - Auto-approve for immediate display
    const ratingTestimonial = await RatingTestimonial.create({
      public_user_id: req.publicUserId,
      rating: Math.round(rating), // Ensure it's an integer
      testimonial: testimonial || null,
      is_approved: true, // Auto-approve for immediate display
      approved_at: new Date(), // Set approval timestamp
    });

    // Clear dismissal timestamp since user has now submitted (never show again)
    await PublicUser.update(
      { rating_prompt_dismissed_at: null },
      { where: { id: req.publicUserId } }
    );

    return res.status(201).json({
      success: true,
      message: "Thank you for your feedback!",
      data: {
        id: ratingTestimonial.id,
        rating: ratingTestimonial.rating,
        testimonial: ratingTestimonial.testimonial,
        is_approved: ratingTestimonial.is_approved,
        createdAt: ratingTestimonial.createdAt,
      },
    });
  } catch (err) {
    console.error("submit rating/testimonial error:", err);

    // Handle unique constraint violation
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "You have already submitted a rating and testimonial",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to submit rating and testimonial",
    });
  }
};

/**
 * Get user's own rating/testimonial
 */
exports.getMyRating = async (req, res) => {
  try {
    const ratingTestimonial = await RatingTestimonial.findOne({
      where: { public_user_id: req.publicUserId },
      attributes: ["id", "rating", "testimonial", "is_approved", "createdAt"],
    });

    if (!ratingTestimonial) {
      return res.json({
        success: true,
        data: null,
      });
    }

    return res.json({
      success: true,
      data: ratingTestimonial,
    });
  } catch (err) {
    console.error("getMyRating error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to get rating",
    });
  }
};

/**
 * Get approved testimonials for public display
 * This endpoint can be accessed without authentication
 */
exports.getApprovedTestimonials = async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;

    const testimonials = await RatingTestimonial.findAll({
      where: {
        is_approved: true,
        testimonial: {
          [Op.ne]: null, // Only return testimonials with text
        },
      },
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: [
            "id",
            "name",
            "username",
            "photo",
            "photo_moderation_status",
            "category",
            "county",
            "isVerified",
          ],
        },
      ],
      order: [
        ["approved_at", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    // Format response to hide sensitive user info and only show approved photos, and add badge types
    const formattedTestimonials = await Promise.all(
      testimonials.map(async (testimonial) => {
        const data = testimonial.toJSON();
        if (data.user) {
          // Only show photo if approved
          if (data.user.photo_moderation_status !== "approved") {
            data.user.photo = null;
          }
          // Remove sensitive fields
          delete data.user.photo_moderation_status;

          // Add badge type if user is verified
          if (data.user.isVerified) {
            const PREMIUM_CATEGORIES = [
              "Sugar Mummy",
              "Sponsor",
              "Ben 10",
              "Urban Chics",
            ];

            // Regular users with Gold subscription get "gold" badge
            if (data.user.category === "Regular") {
              data.user.badgeType = "gold";
            } else if (PREMIUM_CATEGORIES.includes(data.user.category)) {
              // Premium users - check subscription plan
              try {
                const badgeType = await getPremiumBadgeType(testimonial.user);
                data.user.badgeType = badgeType; // "silver" or "gold"
              } catch (error) {
                console.error(
                  "Error getting badge type for testimonial user:",
                  error
                );
                data.user.badgeType = null;
              }
            } else {
              data.user.badgeType = null;
            }
          } else {
            data.user.badgeType = null;
          }
        }
        // Remove internal fields
        delete data.public_user_id;
        return data;
      })
    );

    return res.json({
      success: true,
      data: formattedTestimonials,
    });
  } catch (err) {
    console.error("getApprovedTestimonials error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to get testimonials",
    });
  }
};

/**
 * Get average rating and total count (for public display)
 */
exports.getRatingStats = async (req, res) => {
  try {
    const { Sequelize } = require("sequelize");
    const { sequelize } = require("../models");

    const stats = await RatingTestimonial.findAll({
      where: {
        is_approved: true,
      },
      attributes: [
        [sequelize.fn("AVG", sequelize.col("rating")), "averageRating"],
        [sequelize.fn("COUNT", sequelize.col("id")), "totalRatings"],
      ],
      raw: true,
    });

    const averageRating = stats[0]?.averageRating
      ? parseFloat(stats[0].averageRating).toFixed(1)
      : "0.0";
    const totalRatings = stats[0]?.totalRatings
      ? parseInt(stats[0].totalRatings, 10)
      : 0;

    return res.json({
      success: true,
      data: {
        averageRating: parseFloat(averageRating),
        totalRatings,
      },
    });
  } catch (err) {
    console.error("getRatingStats error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to get rating statistics",
    });
  }
};

/**
 * Admin endpoint to create fake testimonials
 * Allows admin to create testimonials for any user (including fake users)
 */
exports.adminCreateTestimonial = async (req, res) => {
  try {
    const {
      public_user_id,
      rating,
      testimonial,
      autoApprove = true,
    } = req.body;

    // Validate required fields
    if (!public_user_id || !rating) {
      return res.status(400).json({
        success: false,
        message: "public_user_id and rating are required",
      });
    }

    // Validate rating
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Check if user exists
    const user = await PublicUser.findByPk(public_user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if testimonial already exists for this user
    const existingTestimonial = await RatingTestimonial.findOne({
      where: { public_user_id },
    });

    if (existingTestimonial) {
      // Update existing testimonial
      await existingTestimonial.update({
        rating: Math.round(rating),
        testimonial: testimonial || null,
        is_approved: autoApprove,
        approved_at: autoApprove ? new Date() : null,
      });

      return res.json({
        success: true,
        message: "Testimonial updated successfully",
        data: {
          id: existingTestimonial.id,
          rating: existingTestimonial.rating,
          testimonial: existingTestimonial.testimonial,
          is_approved: existingTestimonial.is_approved,
        },
      });
    }

    // Create new testimonial
    const ratingTestimonial = await RatingTestimonial.create({
      public_user_id,
      rating: Math.round(rating),
      testimonial: testimonial || null,
      is_approved: autoApprove,
      approved_at: autoApprove ? new Date() : null,
    });

    return res.status(201).json({
      success: true,
      message: "Fake testimonial created successfully",
      data: {
        id: ratingTestimonial.id,
        rating: ratingTestimonial.rating,
        testimonial: ratingTestimonial.testimonial,
        is_approved: ratingTestimonial.is_approved,
        createdAt: ratingTestimonial.createdAt,
      },
    });
  } catch (err) {
    console.error("admin create testimonial error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create testimonial",
      error: err.message,
    });
  }
};

/**
 * Dismiss the rating prompt
 * Records the dismissal timestamp so prompt won't show again for 3 days
 */
exports.dismissPrompt = async (req, res) => {
  try {
    // Check if user has already submitted (shouldn't dismiss if already submitted)
    const existingRating = await RatingTestimonial.findOne({
      where: { public_user_id: req.publicUserId },
    });

    if (existingRating) {
      return res.json({
        success: true,
        message: "User has already submitted rating",
      });
    }

    // Update user's dismissal timestamp
    await PublicUser.update(
      { rating_prompt_dismissed_at: new Date() },
      { where: { id: req.publicUserId } }
    );

    return res.json({
      success: true,
      message: "Rating prompt dismissed. You'll be prompted again in 3 days.",
      data: {
        dismissedAt: new Date().toISOString(),
        nextPromptDate: new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000
        ).toISOString(), // 3 days from now
      },
    });
  } catch (err) {
    console.error("dismissPrompt error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to dismiss prompt",
    });
  }
};
