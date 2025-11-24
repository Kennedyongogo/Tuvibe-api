const { Op, Sequelize } = require("sequelize");
const {
  Story,
  StoryView,
  StoryReaction,
  StoryComment,
  StoryHighlight,
  StoryCollection,
  StoryChallenge,
  StoryMusic,
  PublicUser,
  Notification,
} = require("../models");
const path = require("path");
const storyService = require("../services/storyService");
const { sendEventToUsers, broadcastToAll } = require("../routes/sseRoutes");

// Simple in-memory cache for stories feed (5 seconds TTL)
// For production, consider Redis for distributed caching
const feedCache = new Map();
const CACHE_TTL = 5000; // 5 seconds

const getCacheKey = (userId, latitude, longitude) => {
  return `feed:${userId || 'anon'}:${latitude || 'none'}:${longitude || 'none'}`;
};

const getCachedFeed = (key) => {
  const cached = feedCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  feedCache.delete(key);
  return null;
};

const setCachedFeed = (key, data) => {
  feedCache.set(key, {
    data,
    timestamp: Date.now()
  });
};

// Clean up old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of feedCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      feedCache.delete(key);
    }
  }
}, CACHE_TTL);

// Helper to calculate expiration date (24 hours from now)
const getExpirationDate = () => {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt;
};

// Create a new story
exports.createStory = async (req, res) => {
  console.log("📥 [Backend] Story creation request received");
  console.log("📋 [Backend] Request details:", {
    userId: req.publicUserId,
    hasFile: !!req.file,
    fileInfo: req.file
      ? {
          filename: req.file.filename,
          mimetype: req.file.mimetype,
          size: req.file.size,
        }
      : null,
    body: req.body,
  });

  try {
    const {
      caption,
      location,
      latitude,
      longitude,
      highlight_id,
      collection_id,
      challenge_id,
      scheduled_at,
      metadata,
      background_color,
      music_id,
    } = req.body;

    // Allow text-only stories (no file required if caption is provided)
    const isTextOnly = !req.file && caption && caption.trim();

    if (!req.file && !isTextOnly) {
      console.log("❌ [Backend] No file uploaded and no text provided");
      return res.status(400).json({
        success: false,
        message:
          "Please provide either a media file or text content for your story",
      });
    }

    let mediaType = "text";
    let mediaUrl = null;

    if (req.file) {
      // Determine media type
      const isVideo = req.file.mimetype.startsWith("video/");
      mediaType = isVideo ? "video" : "photo";
      mediaUrl = `stories/${req.file.filename}`;

      console.log("🎬 [Backend] Media type determined:", {
        isVideo,
        mediaType,
        mediaUrl,
      });
    } else {
      console.log("📝 [Backend] Text-only story detected");
    }

    // Calculate expiration
    const expiresAt = scheduled_at
      ? new Date(new Date(scheduled_at).getTime() + 24 * 60 * 60 * 1000)
      : getExpirationDate();

    console.log("⏰ [Backend] Expiration date:", expiresAt);

    // Prepare metadata with background color for text stories
    let storyMetadata = {};
    if (metadata) {
      try {
        storyMetadata =
          typeof metadata === "string" ? JSON.parse(metadata) : metadata;
      } catch (e) {
        console.error("Failed to parse metadata:", e);
        storyMetadata = {};
      }
    }

    // Add background color to metadata for text stories
    if (isTextOnly && background_color) {
      storyMetadata.background_color = background_color;
    }

    const storyData = {
      public_user_id: req.publicUserId,
      media_type: mediaType,
      media_url: mediaUrl,
      caption: caption ? caption.trim() : null,
      location: location || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      expires_at: expiresAt,
      highlight_id: highlight_id || null,
      collection_id: collection_id || null,
      challenge_id: challenge_id || null,
      music_id: music_id || null,
      scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
      is_published: scheduled_at ? false : true,
      moderation_status: "pending",
      metadata: storyMetadata,
    };

    console.log("💾 [Backend] Story data prepared:", storyData);
    console.log("🔄 [Backend] Creating story in database...");

    const story = await Story.create(storyData);

    console.log("✅ [Backend] Story created successfully!", {
      storyId: story.id,
      userId: story.public_user_id,
      mediaUrl: story.media_url,
      expiresAt: story.expires_at,
    });

    // Clear feed cache for this user (their own story will appear)
    const cacheKey = getCacheKey(story.public_user_id, null, null);
    feedCache.delete(cacheKey);

    // Send SSE event to notify user's own feed (for immediate update)
    try {
      sendEventToUsers([story.public_user_id], "story:new", {
        storyId: story.id,
        userId: story.public_user_id,
        type: "created"
      });
    } catch (err) {
      console.error("Failed to send SSE event for story creation:", err);
    }

    return res.status(201).json({
      success: true,
      message: "Story created successfully",
      data: { story },
    });
  } catch (err) {
    console.error("💥 [Backend] createStory error:", err);
    console.error("💥 [Backend] Error stack:", err.stack);
    return res.status(500).json({
      success: false,
      message: "Failed to create story",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// Get stories feed (stories from users you follow or nearby)
exports.getStoriesFeed = async (req, res) => {
  console.log("📥 [Backend] Stories feed request received");
  try {
    const { latitude, longitude, radius = 50, limit = 50 } = req.query;
    const userId = req.publicUserId;

    // Check cache first (reduces database load for 10k+ users)
    const cacheKey = getCacheKey(userId, latitude, longitude);
    const cached = getCachedFeed(cacheKey);
    if (cached) {
      console.log("✅ [Backend] Returning cached feed");
      return res.json(cached);
    }

    console.log("📋 [Backend] Feed request details:", {
      userId,
      latitude,
      longitude,
      radius,
      limit,
    });

    // Build where clause properly for Sequelize
    const baseConditions = {
      is_published: true,
      expires_at: { [Op.gt]: new Date() },
    };

    // Moderation/user conditions
    if (userId) {
      // Show user's own stories even if pending, but only approved stories from others
      baseConditions[Op.or] = [
        { public_user_id: userId }, // User's own stories (including pending)
        { moderation_status: "approved" }, // Others' stories must be approved
      ];
      console.log(
        "✅ [Backend] User authenticated - will show own stories (including pending) and approved stories from others"
      );
    } else {
      // For non-authenticated users, only show approved stories
      baseConditions.moderation_status = "approved";
      console.log(
        "👤 [Backend] User not authenticated - will show only approved stories"
      );
    }

    // Location-based filtering if coordinates provided
    // IMPORTANT: User's own stories should always be included, even without coordinates
    // For authenticated users, show all approved stories (not just nearby) to ensure visibility
    if (latitude && longitude && userId) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const rad = parseFloat(radius) || 50; // Default to 50km if not provided

      console.log(
        "📍 [Backend] Location filter requested, but user is authenticated"
      );
      console.log(
        "📍 [Backend] Will include user's own stories regardless of location"
      );
      console.log(
        "📍 [Backend] Will show ALL approved stories (location filter is informational only)"
      );

      // For authenticated users: Show all approved stories regardless of location
      // This ensures users can see stories from all accounts, not just nearby ones
      // Location is still used for sorting/prioritization but doesn't filter out stories
      baseConditions[Op.or] = [
        { public_user_id: userId }, // User's own stories (no location/moderation filter)
        { moderation_status: "approved" }, // All approved stories from other users
      ];
    } else if (latitude && longitude && !userId) {
      // For non-authenticated users, apply location filter
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const rad = parseFloat(radius);

      console.log(
        "📍 [Backend] Location filter applied for non-authenticated user"
      );
      baseConditions.latitude = {
        [Op.between]: [lat - rad / 111, lat + rad / 111],
      };
      baseConditions.longitude = {
        [Op.between]: [lon - rad / 111, lon + rad / 111],
      };
    }

    const whereClause = baseConditions;
    console.log(
      "🔍 [Backend] Final where clause:",
      JSON.stringify(whereClause, null, 2)
    );

    const stories = await Story.findAll({
      where: whereClause,
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
        {
          model: StoryView,
          as: "views",
          where: { viewer_id: userId },
          required: false,
        },
        {
          model: StoryReaction,
          as: "reactions",
          where: { user_id: userId },
          required: false,
          separate: true, // Use separate query to allow ordering
          order: [["createdAt", "DESC"]],
          limit: 1, // Get only the most recent reaction for UI
        },
        {
          model: StoryChallenge,
          as: "challenge",
          required: false,
        },
        {
          model: StoryCollection,
          as: "collection",
          required: false,
        },
        {
          model: StoryMusic,
          as: "music",
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
    });

    console.log("📊 [Backend] Stories found:", stories.length);
    console.log(
      "📊 [Backend] Stories details:",
      stories.map((s) => ({
        id: s.id,
        userId: s.public_user_id,
        mediaUrl: s.media_url,
        moderationStatus: s.moderation_status,
        hasLocation: !!(s.latitude && s.longitude),
      }))
    );

    // Format stories with view status
    const formattedStories = stories.map((story) => {
      const storyObj = story.toJSON();
      storyObj.has_viewed = storyObj.views && storyObj.views.length > 0;
      storyObj.user_reaction = storyObj.reactions && storyObj.reactions[0];
      delete storyObj.views;
      delete storyObj.reactions;
      return storyObj;
    });

    // Group stories by user
    const storiesByUser = {};
    formattedStories.forEach((story) => {
      const userId = story.user.id;
      if (!storiesByUser[userId]) {
        storiesByUser[userId] = {
          user: story.user,
          stories: [],
        };
      }
      storiesByUser[userId].stories.push(story);
    });

    console.log("✅ [Backend] Returning stories grouped by user:", {
      userCount: Object.keys(storiesByUser).length,
      totalStories: formattedStories.length,
      userIds: Object.keys(storiesByUser),
    });

    const response = {
      success: true,
      data: {
        stories: Object.values(storiesByUser),
        total: formattedStories.length,
      },
    };

    // Cache the response (reduces database load for 10k+ users)
    setCachedFeed(cacheKey, response);

    return res.json(response);
  } catch (err) {
    console.error("💥 [Backend] getStoriesFeed error:", err);
    console.error("💥 [Backend] Error stack:", err.stack);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stories feed",
    });
  }
};

// Get a single story with details
exports.getStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.publicUserId;

    const story = await Story.findByPk(storyId, {
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
        {
          model: StoryView,
          as: "views",
          include: [
            {
              model: PublicUser,
              as: "viewer",
              attributes: ["id", "name", "username", "photo"],
            },
          ],
          limit: 10,
          order: [["viewed_at", "DESC"]],
        },
        {
          model: StoryReaction,
          as: "reactions",
          include: [
            {
              model: PublicUser,
              as: "user",
              attributes: ["id", "name", "username", "photo"],
            },
          ],
        },
        {
          model: StoryComment,
          as: "comments",
          include: [
            {
              model: PublicUser,
              as: "user",
              attributes: ["id", "name", "username", "photo"],
            },
            {
              model: StoryComment,
              as: "replies",
              include: [
                {
                  model: PublicUser,
                  as: "user",
                  attributes: ["id", "name", "username", "photo"],
                },
              ],
            },
          ],
          order: [["createdAt", "DESC"]],
          limit: 20,
        },
        {
          model: StoryChallenge,
          as: "challenge",
        },
        {
          model: StoryCollection,
          as: "collection",
        },
        {
          model: StoryMusic,
          as: "music",
        },
      ],
    });

    if (!story) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found" });
    }

    // Check if user has viewed this story
    const hasViewed = await StoryView.findOne({
      where: { story_id: storyId, viewer_id: userId },
    });

    // Record view if not already viewed
    if (!hasViewed && story.public_user_id !== userId) {
      await StoryView.create({
        story_id: storyId,
        viewer_id: userId,
      });

      // Update view count
      await story.increment("view_count");
      
      // Reload story to get updated count
      await story.reload();

      // Broadcast SSE event to all connected users
      try {
        console.log("📡 [Backend] Broadcasting story:viewed event", {
          storyId: story.id,
          viewCount: story.view_count,
        });
        broadcastToAll("story:viewed", {
          storyId: story.id,
          viewCount: story.view_count,
        });
      } catch (err) {
        console.error("Failed to send SSE event for story view:", err);
      }
    }

    // Get user's most recent reaction (for UI display)
    const userReaction = await StoryReaction.findOne({
      where: { story_id: storyId, user_id: userId },
      order: [["createdAt", "DESC"]],
    });

    const storyObj = story.toJSON();
    storyObj.has_viewed = !!hasViewed;
    storyObj.user_reaction = userReaction; // Most recent reaction for UI

    return res.json({
      success: true,
      data: { story: storyObj },
    });
  } catch (err) {
    console.error("getStory error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch story",
    });
  }
};

// Get user's own stories
exports.getMyStories = async (req, res) => {
  try {
    const userId = req.publicUserId;
    const { include_expired = false } = req.query;

    const whereClause = {
      public_user_id: userId,
    };

    if (!include_expired) {
      whereClause.expires_at = { [Op.gt]: new Date() };
    }

    const stories = await Story.findAll({
      where: whereClause,
      include: [
        {
          model: StoryView,
          as: "views",
          attributes: ["id", "viewer_id", "viewed_at"],
          limit: 10,
          order: [["viewed_at", "DESC"]],
        },
        {
          model: StoryReaction,
          as: "reactions",
        },
        {
          model: StoryComment,
          as: "comments",
        },
        {
          model: StoryHighlight,
          as: "highlight",
        },
        {
          model: StoryCollection,
          as: "collection",
        },
        {
          model: StoryChallenge,
          as: "challenge",
        },
        {
          model: StoryMusic,
          as: "music",
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      success: true,
      data: { stories },
    });
  } catch (err) {
    console.error("getMyStories error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch your stories",
    });
  }
};

// Delete a story
exports.deleteStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.publicUserId;

    const story = await Story.findOne({
      where: { id: storyId, public_user_id: userId },
    });

    if (!story) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found" });
    }

    // Delete story and all related records using the same function as cleanup
    await storyService.deleteStoryWithRelatedRecords(story);

    return res.json({
      success: true,
      message: "Story deleted successfully",
    });
  } catch (err) {
    console.error("deleteStory error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete story",
    });
  }
};

// Add reaction to story
exports.addReaction = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { reaction_type = "like", emoji, emojis } = req.body;
    const userId = req.publicUserId;

    const story = await Story.findByPk(storyId, {
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username"],
        },
      ],
    });
    if (!story) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found" });
    }

    // Prevent story owners from reacting to their own stories
    if (story.public_user_id === userId) {
      return res.status(403).json({
        success: false,
        message: "You cannot react to your own story",
      });
    }

    // Get the user who is reacting
    const reactingUser = await PublicUser.findByPk(userId, {
      attributes: ["id", "name", "username"],
    });

    // Handle multiple emojis: if emojis array is provided, join them; otherwise use single emoji
    let emojiString = null;
    if (emojis && Array.isArray(emojis) && emojis.length > 0) {
      // Join multiple emojis with comma separator
      emojiString = emojis.join(",");
    } else if (emoji) {
      emojiString = emoji;
    }

    // Create a single reaction with all emojis
    const reaction = await StoryReaction.create({
      story_id: storyId,
      user_id: userId,
      reaction_type: emojiString ? "emoji" : reaction_type,
      emoji: emojiString || null,
    });

    // Update reaction count - count this as one reaction regardless of number of emojis
    await story.increment("reaction_count");
    
    // Reload story to get updated count
    await story.reload();

    // Broadcast SSE event to all connected users
    try {
      broadcastToAll("story:reacted", {
        storyId: story.id,
        reactionCount: story.reaction_count,
      });
    } catch (err) {
      console.error("Failed to send SSE event for story reaction:", err);
    }

    // Create notification for story owner
    try {
      const userName =
        reactingUser?.name || reactingUser?.username || "Someone";

      // Format emoji display: show all emojis if multiple, or single emoji
      let reactionDisplay = reaction_type;
      if (emojiString) {
        const emojiArray = emojiString.split(",");
        if (emojiArray.length > 1) {
          // Multiple emojis: show them all
          reactionDisplay = emojiArray.join(" ");
        } else {
          // Single emoji
          reactionDisplay = emojiString;
        }
      }

      // Create notification
      await Notification.create({
        public_user_id: story.public_user_id,
        title: "New Reaction on Your Story",
        message: `${userName} reacted to your story with ${reactionDisplay}`,
        isRead: false,
      });
    } catch (notifErr) {
      console.error("Failed to create reaction notification:", notifErr);
      // Don't fail the request if notification creation fails
    }

    return res.json({
      success: true,
      message: "Reaction added",
      data: { reaction },
    });
  } catch (err) {
    console.error("addReaction error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add reaction",
    });
  }
};

// Remove reaction from story
exports.removeReaction = async (req, res) => {
  try {
    const { storyId, reactionId } = req.params;
    const userId = req.publicUserId;

    // If reactionId is provided, remove that specific reaction
    // Otherwise, remove the most recent reaction from this user for this story
    let reaction;

    if (reactionId) {
      // Remove specific reaction
      reaction = await StoryReaction.findOne({
        where: { id: reactionId, story_id: storyId, user_id: userId },
      });
    } else {
      // Remove most recent reaction
      reaction = await StoryReaction.findOne({
        where: { story_id: storyId, user_id: userId },
        order: [["createdAt", "DESC"]],
      });
    }

    if (!reaction) {
      return res
        .status(404)
        .json({ success: false, message: "Reaction not found" });
    }

    await reaction.destroy();

    // Update reaction count
    const story = await Story.findByPk(storyId);
    if (story) {
      await story.decrement("reaction_count");
      await story.reload();

      // Broadcast SSE event to all connected users
      try {
        broadcastToAll("story:reacted", {
          storyId: story.id,
          reactionCount: story.reaction_count,
        });
      } catch (err) {
        console.error("Failed to send SSE event for story reaction removal:", err);
      }
    }

    return res.json({
      success: true,
      message: "Reaction removed",
    });
  } catch (err) {
    console.error("removeReaction error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to remove reaction",
    });
  }
};

// Add comment to story
exports.addComment = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { content, parent_comment_id } = req.body;
    const userId = req.publicUserId;

    if (!content || !content.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Comment content is required" });
    }

    const story = await Story.findByPk(storyId, {
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username"],
        },
      ],
    });
    if (!story) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found" });
    }

    // Prevent story owners from commenting on their own stories
    if (story.public_user_id === userId) {
      return res.status(403).json({
        success: false,
        message: "You cannot comment on your own story",
      });
    }

    // Get the user who is commenting
    const commentingUser = await PublicUser.findByPk(userId, {
      attributes: ["id", "name", "username"],
    });

    const comment = await StoryComment.create({
      story_id: storyId,
      user_id: userId,
      content: content.trim(),
      parent_comment_id: parent_comment_id || null,
    });

    // Update comment count
    await story.increment("comment_count");
    
    // Reload story to get updated count
    await story.reload();

    // Broadcast SSE event to all connected users
    try {
      broadcastToAll("story:commented", {
        storyId: story.id,
        commentCount: story.comment_count,
      });
    } catch (err) {
      console.error("Failed to send SSE event for story comment:", err);
    }

    // Fetch comment with user details
    const commentWithUser = await StoryComment.findByPk(comment.id, {
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username", "photo"],
        },
      ],
    });

    // Create notification for story owner
    try {
      const userName =
        commentingUser?.name || commentingUser?.username || "Someone";
      const commentPreview =
        content.trim().length > 50
          ? content.trim().substring(0, 50) + "..."
          : content.trim();
      await Notification.create({
        public_user_id: story.public_user_id,
        title: "New Comment on Your Story",
        message: `${userName} commented: "${commentPreview}"`,
        isRead: false,
      });
    } catch (notifErr) {
      console.error("Failed to create comment notification:", notifErr);
      // Don't fail the request if notification creation fails
    }

    return res.status(201).json({
      success: true,
      message: "Comment added",
      data: { comment: commentWithUser },
    });
  } catch (err) {
    console.error("addComment error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add comment",
    });
  }
};

// Delete comment
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.publicUserId;

    const comment = await StoryComment.findOne({
      where: { id: commentId, user_id: userId },
    });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    }

    const storyId = comment.story_id;
    await comment.destroy();

    // Update comment count
    const story = await Story.findByPk(storyId);
    if (story) {
      await story.decrement("comment_count");
      await story.reload();

      // Broadcast SSE event to all connected users
      try {
        broadcastToAll("story:commented", {
          storyId: story.id,
          commentCount: story.comment_count,
        });
      } catch (err) {
        console.error("Failed to send SSE event for story comment deletion:", err);
      }
    }

    return res.json({
      success: true,
      message: "Comment deleted",
    });
  } catch (err) {
    console.error("deleteComment error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete comment",
    });
  }
};

// Create story highlight
exports.createHighlight = async (req, res) => {
  try {
    const { title, cover_image_url, story_ids } = req.body;
    const userId = req.publicUserId;

    if (!title) {
      return res
        .status(400)
        .json({ success: false, message: "Title is required" });
    }

    const highlight = await StoryHighlight.create({
      public_user_id: userId,
      title,
      cover_image_url: cover_image_url || null,
    });

    // Add stories to highlight if provided
    if (story_ids && Array.isArray(story_ids) && story_ids.length > 0) {
      await Story.update(
        { highlight_id: highlight.id, is_highlight: true },
        {
          where: {
            id: { [Op.in]: story_ids },
            public_user_id: userId,
          },
        }
      );
    }

    return res.status(201).json({
      success: true,
      message: "Highlight created",
      data: { highlight },
    });
  } catch (err) {
    console.error("createHighlight error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create highlight",
    });
  }
};

// Get user highlights
exports.getHighlights = async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUserId = userId || req.publicUserId;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const highlights = await StoryHighlight.findAll({
      where: { public_user_id: targetUserId },
      include: [
        {
          model: Story,
          as: "stories",
          where: {
            expires_at: { [Op.gt]: new Date() },
            is_published: true,
            moderation_status: "approved",
          },
          required: false,
          include: [
            {
              model: PublicUser,
              as: "user",
              attributes: ["id", "name", "username", "photo"],
            },
          ],
        },
      ],
      order: [
        ["order", "ASC"],
        ["createdAt", "DESC"],
      ],
    });

    return res.json({
      success: true,
      data: { highlights },
    });
  } catch (err) {
    console.error("getHighlights error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch highlights",
    });
  }
};

// Get nearby stories (location-based)
exports.getNearbyStories = async (req, res) => {
  try {
    const { latitude, longitude, radius = 50, limit = 20 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const rad = parseFloat(radius);

    const stories = await Story.findAll({
      where: {
        is_published: true,
        moderation_status: "approved",
        expires_at: { [Op.gt]: new Date() },
        latitude: {
          [Op.between]: [lat - rad / 111, lat + rad / 111],
        },
        longitude: {
          [Op.between]: [lon - rad / 111, lon + rad / 111],
        },
      },
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
        {
          model: StoryMusic,
          as: "music",
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
    });

    return res.json({
      success: true,
      data: { stories },
    });
  } catch (err) {
    console.error("getNearbyStories error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch nearby stories",
    });
  }
};

// Get active challenges
exports.getChallenges = async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const challenges = await StoryChallenge.findAll({
      where: {
        is_active: true,
        start_date: { [Op.lte]: new Date() },
        [Op.or]: [{ end_date: null }, { end_date: { [Op.gte]: new Date() } }],
      },
      include: [
        {
          model: Story,
          as: "stories",
          where: {
            is_published: true,
            moderation_status: "approved",
            expires_at: { [Op.gt]: new Date() },
          },
          required: false,
          limit: 5,
          order: [["createdAt", "DESC"]],
        },
      ],
      order: [
        ["participant_count", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: parseInt(limit),
    });

    return res.json({
      success: true,
      data: { challenges },
    });
  } catch (err) {
    console.error("getChallenges error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch challenges",
    });
  }
};

// Get story analytics
exports.getStoryAnalytics = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.publicUserId;

    const story = await Story.findOne({
      where: { id: storyId, public_user_id: userId },
      include: [
        {
          model: StoryView,
          as: "views",
          include: [
            {
              model: PublicUser,
              as: "viewer",
              attributes: ["id", "name", "username", "photo"],
            },
          ],
        },
        {
          model: StoryReaction,
          as: "reactions",
          include: [
            {
              model: PublicUser,
              as: "user",
              attributes: ["id", "name", "username", "photo"],
            },
          ],
        },
        {
          model: StoryComment,
          as: "comments",
          include: [
            {
              model: PublicUser,
              as: "user",
              attributes: ["id", "name", "username", "photo"],
            },
          ],
        },
      ],
    });

    if (!story) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found" });
    }

    return res.json({
      success: true,
      data: {
        analytics: {
          views: story.views || [],
          reactions: story.reactions || [],
          comments: story.comments || [],
          view_count: story.view_count,
          reaction_count: story.reaction_count,
          comment_count: story.comment_count,
        },
      },
    });
  } catch (err) {
    console.error("getStoryAnalytics error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
    });
  }
};

// Get all stories for moderation (admin only)
exports.getStoriesForModeration = async (req, res) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query;
    const limit = Math.min(Number(pageSize) || 20, 100);
    const offset = (Number(page) - 1) * limit;

    const where = {};
    if (status) {
      where.moderation_status = status;
    }

    const { count, rows } = await Story.findAndCountAll({
      where,
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username", "photo", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const formatted = rows.map((story) => {
      const storyObj = story.toJSON();
      return {
        id: storyObj.id,
        media_url: storyObj.media_url,
        media_type: storyObj.media_type,
        caption: storyObj.caption,
        moderation_status: storyObj.moderation_status,
        is_published: storyObj.is_published,
        expires_at: storyObj.expires_at,
        createdAt: storyObj.createdAt,
        user: storyObj.user,
      };
    });

    return res.json({
      success: true,
      data: formatted,
      pagination: {
        total: count,
        page: Number(page),
        pageSize: limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("getStoriesForModeration error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stories for moderation",
    });
  }
};

// Approve story (admin only)
exports.approveStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { notes } = req.body;

    const story = await Story.findByPk(storyId, {
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!story) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found" });
    }

    await story.update({
      moderation_status: "approved",
      is_published: true,
    });

    // Clear all feed caches (story is now visible to all users)
    feedCache.clear();

    // Send notification to user
    if (story.user && story.user.id) {
      const { Notification } = require("../models");
      await Notification.create({
        public_user_id: story.user.id,
        type: "story_approved",
        title: "Story Approved",
        message: "Your story has been approved and is now visible to others.",
        isRead: false,
        data: { story_id: story.id },
      });
    }

    // Send SSE events to notify users
    try {
      // Notify story creator
      if (story.user?.id) {
        sendEventToUsers([story.user.id], "story:approved", {
          storyId: story.id,
          userId: story.user.id,
          type: "approved"
        });
      }
      // Broadcast to all connected users so they can see the newly approved story
      broadcastToAll("story:approved", {
        storyId: story.id,
        userId: story.user?.id,
        type: "approved"
      });
    } catch (err) {
      console.error("Failed to send SSE event for story approval:", err);
    }

    return res.json({
      success: true,
      message: "Story approved successfully",
      data: {
        id: story.id,
        moderation_status: "approved",
      },
    });
  } catch (err) {
    console.error("approveStory error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to approve story",
    });
  }
};

// Reject story (admin only)
exports.rejectStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { notes, reason } = req.body;

    const story = await Story.findByPk(storyId, {
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!story) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found" });
    }

    await story.update({
      moderation_status: "rejected",
      is_published: false,
    });

    // Send notification to user
    if (story.user && story.user.id) {
      const { Notification } = require("../models");
      await Notification.create({
        public_user_id: story.user.id,
        type: "story_rejected",
        title: "Story Rejected",
        message:
          reason ||
          "Your story has been rejected and will not be visible to others.",
        isRead: false,
        data: { story_id: story.id, reason, notes },
      });
    }

    return res.json({
      success: true,
      message: "Story rejected successfully",
      data: {
        id: story.id,
        moderation_status: "rejected",
      },
    });
  } catch (err) {
    console.error("rejectStory error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to reject story",
    });
  }
};

// Get story viewers (only for story owner)
exports.getStoryViewers = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.publicUserId;

    // Find the story
    const story = await Story.findByPk(storyId);
    if (!story) {
      return res
        .status(404)
        .json({ success: false, message: "Story not found" });
    }

    // Only story owner can see viewers
    if (story.public_user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only story owner can view the viewers list",
      });
    }

    // Get all views with user information
    const views = await StoryView.findAll({
      where: { story_id: storyId },
      include: [
        {
          model: PublicUser,
          as: "viewer",
          attributes: ["id", "name", "username", "photo", "is_verified"],
        },
      ],
      order: [["viewed_at", "DESC"]],
    });

    const viewers = views.map((view) => ({
      id: view.viewer.id,
      name: view.viewer.name,
      username: view.viewer.username,
      photo: view.viewer.photo,
      isVerified: view.viewer.is_verified,
      viewedAt: view.viewed_at,
    }));

    return res.json({
      success: true,
      data: { viewers },
    });
  } catch (err) {
    console.error("getStoryViewers error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch story viewers",
    });
  }
};
