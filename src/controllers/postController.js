const { Op } = require("sequelize");
const models = require("../models");
// Use models object directly to ensure associations are recognized
const {
  Post,
  PostReaction,
  PostComment,
  CommentReaction,
  PublicUser,
  Notification,
} = models;
const path = require("path");
const { sendEventToUsers, broadcastToAll } = require("../routes/sseRoutes");

// Ensure we're using the models with associations
// Access models directly from the require to get the same instances
const PostModel = models.Post;
const PublicUserModel = models.PublicUser;
const PostReactionModel = models.PostReaction;
const PostCommentModel = models.PostComment;
const CommentReactionModel = models.CommentReaction;
const NotificationModel = models.Notification;

// Create a new post
exports.createPost = async (req, res) => {
  try {
    const {
      caption,
      location,
      latitude,
      longitude,
      metadata,
      background_color,
    } = req.body;

    // Allow text-only posts (no file required if caption is provided)
    const isTextOnly = !req.file && caption && caption.trim();

    if (!req.file && !isTextOnly) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide either a media file or text content for your post",
      });
    }

    let mediaType = "text";
    let mediaUrl = null;

    if (req.file) {
      // Determine media type
      const isVideo = req.file.mimetype.startsWith("video/");
      mediaType = isVideo ? "video" : "photo";
      mediaUrl = `posts/${req.file.filename}`;
    }

    // Prepare metadata with background color for text posts
    let postMetadata = {};
    if (metadata) {
      try {
        postMetadata =
          typeof metadata === "string" ? JSON.parse(metadata) : metadata;
      } catch (e) {
        console.error("Failed to parse metadata:", e);
        postMetadata = {};
      }
    }

    // Add background color to metadata for text posts
    if (isTextOnly && background_color) {
      postMetadata.background_color = background_color;
    }

    const postData = {
      public_user_id: req.publicUserId,
      media_type: mediaType,
      media_url: mediaUrl,
      caption: caption ? caption.trim() : null,
      location: location || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      is_published: true,
      moderation_status: "pending",
      metadata: postMetadata,
    };

    const post = await models.Post.create(postData);

    // Fetch post with user details
    const postWithUser = await PostModel.findByPk(post.id, {
      include: [
        {
          model: PublicUserModel,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Post created successfully",
      data: { post: postWithUser },
    });
  } catch (err) {
    console.error("createPost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create post",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// Get posts feed
exports.getPostsFeed = async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const userId = req.publicUserId;

    const baseConditions = {
      is_published: true,
    };

    // Moderation/user conditions
    if (userId) {
      // Show user's own posts even if pending, but only approved posts from others
      baseConditions[Op.or] = [
        { public_user_id: userId }, // User's own posts (including pending)
        { moderation_status: "approved" }, // Others' posts must be approved
      ];
    } else {
      // For non-authenticated users, only show approved posts
      baseConditions.moderation_status = "approved";
    }

    const posts = await PostModel.findAll({
      where: baseConditions,
      include: [
        {
          model: PublicUserModel,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Get user reactions for each post separately
    const formattedPosts = await Promise.all(
      posts.map(async (post) => {
        const postObj = post.toJSON();

        // Get user's like reaction (for toggle behavior)
        if (userId) {
          const userLikeReaction = await PostReaction.findOne({
            where: {
              post_id: post.id,
              user_id: userId,
              reaction_type: "like",
              emoji: null,
            },
          });
          // Also get most recent emoji reaction if any
          const userEmojiReaction = await PostReaction.findOne({
            where: {
              post_id: post.id,
              user_id: userId,
              reaction_type: "emoji",
            },
            order: [["createdAt", "DESC"]],
          });
          // Return like reaction if exists, otherwise emoji reaction
          postObj.user_reaction = userLikeReaction || userEmojiReaction || null;
        } else {
          postObj.user_reaction = null;
        }

        // Get all emoji reactions - show unique emojis from different users (one per user, most recent)
        const emojiReactions = await PostReaction.findAll({
          where: {
            post_id: post.id,
            emoji: { [Op.not]: null },
            reaction_type: "emoji",
          },
          include: [
            {
              model: PublicUserModel,
              as: "user",
              attributes: ["id"],
            },
          ],
          order: [["createdAt", "DESC"]],
        });
        
        // Extract unique emojis: split comma-separated emojis and get first emoji from each user's most recent reaction
        const userEmojiMap = new Map(); // Track which emoji we've shown per user
        const recentEmojis = [];
        
        for (const reaction of emojiReactions) {
          if (!reaction.emoji) continue;
          
          const userId = reaction.user?.id || reaction.user_id;
          
          // Skip if we already have an emoji from this user
          if (userEmojiMap.has(userId)) continue;
          
          // Split comma-separated emojis and take the first one
          const firstEmoji = reaction.emoji.split(",")[0].trim();
          if (firstEmoji) {
            recentEmojis.push(firstEmoji);
            userEmojiMap.set(userId, true);
            
            // Stop after collecting 3 unique emojis (one per user)
            if (recentEmojis.length >= 3) break;
          }
        }
        
        postObj.recent_emoji_reactions = recentEmojis;

        return postObj;
      })
    );

    const total = await PostModel.count({ where: baseConditions });

    return res.json({
      success: true,
      data: {
        posts: formattedPosts,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (err) {
    console.error("getPostsFeed error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch posts feed",
    });
  }
};

// Get a single post with details
exports.getPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.publicUserId;

    const post = await PostModel.findByPk(postId, {
      include: [
        {
          model: PublicUserModel,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
        {
          model: PostReactionModel,
          as: "reactions",
          include: [
            {
              model: PublicUserModel,
              as: "user",
              attributes: ["id", "name", "username", "photo"],
            },
          ],
        },
        {
          model: PostCommentModel,
          as: "comments",
          include: [
            {
              model: PublicUserModel,
              as: "user",
              attributes: ["id", "name", "username", "photo"],
            },
            {
              model: PostCommentModel,
              as: "replies",
              include: [
                {
                  model: PublicUserModel,
                  as: "user",
                  attributes: ["id", "name", "username", "photo"],
                },
              ],
            },
            {
              model: CommentReactionModel,
              as: "reactions",
              include: [
                {
                  model: PublicUserModel,
                  as: "user",
                  attributes: ["id", "name", "username", "photo"],
                },
              ],
            },
          ],
          order: [["createdAt", "DESC"]],
          limit: 50,
        },
      ],
    });

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // Check if user can view post (own post or approved)
    if (
      post.public_user_id !== userId &&
      post.moderation_status !== "approved"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Post not available" });
    }

    // Get user's like reaction (for toggle behavior)
    let userReaction = null;
    if (userId) {
      // Check for like reaction first
      const userLikeReaction = await PostReaction.findOne({
        where: {
          post_id: postId,
          user_id: userId,
          reaction_type: "like",
          emoji: null,
        },
      });
      // Also get most recent emoji reaction if any
      const userEmojiReaction = await PostReaction.findOne({
        where: {
          post_id: postId,
          user_id: userId,
          reaction_type: "emoji",
        },
        order: [["createdAt", "DESC"]],
      });
      // Return like reaction if exists, otherwise emoji reaction
      userReaction = userLikeReaction || userEmojiReaction || null;
    }

    // Get user reactions for each comment
    const postObj = post.toJSON();
    postObj.user_reaction = userReaction;

    // Get all emoji reactions - show unique emojis from different users (one per user, most recent)
    const emojiReactions = await PostReaction.findAll({
      where: {
        post_id: postId,
        emoji: { [Op.not]: null },
        reaction_type: "emoji",
      },
      include: [
        {
          model: PublicUserModel,
          as: "user",
          attributes: ["id"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    
    // Extract unique emojis: split comma-separated emojis and get first emoji from each user's most recent reaction
    const userEmojiMap = new Map(); // Track which emoji we've shown per user
    const recentEmojis = [];
    
    for (const reaction of emojiReactions) {
      if (!reaction.emoji) continue;
      
      const userId = reaction.user?.id || reaction.user_id;
      
      // Skip if we already have an emoji from this user
      if (userEmojiMap.has(userId)) continue;
      
      // Split comma-separated emojis and take the first one
      const firstoji = reaction.emoji.split(",")[0].trim();
      if (firstoji) {
        recentEmojis.push(firstoji);
        userEmojiMap.set(userId, true);
        
        // Stop after collecting 3 unique emojis (one per user)
        if (recentEmojis.length >= 3) break;
      }
    }
    
    postObj.recent_emoji_reactions = recentEmojis;

    if (userId && postObj.comments) {
      for (const comment of postObj.comments) {
        // Get user's most recent reaction to this comment
        const userCommentReaction = await CommentReaction.findOne({
          where: { comment_id: comment.id, user_id: userId },
          order: [["createdAt", "DESC"]],
        });
        comment.user_reaction = userCommentReaction || null;

        // Get user reactions for replies too
        if (comment.replies) {
          for (const reply of comment.replies) {
            const userReplyReaction = await CommentReaction.findOne({
              where: { comment_id: reply.id, user_id: userId },
              order: [["createdAt", "DESC"]],
            });
            reply.user_reaction = userReplyReaction || null;
          }
        }
      }
    }

    return res.json({
      success: true,
      data: { post: postObj },
    });
  } catch (err) {
    console.error("getPost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch post",
    });
  }
};

// Get user's own posts
exports.getMyPosts = async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const userId = req.publicUserId;

    const posts = await PostModel.findAll({
      where: { public_user_id: userId },
      include: [
        {
          model: PublicUserModel,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const total = await PostModel.count({
      where: { public_user_id: userId },
    });

    return res.json({
      success: true,
      data: {
        posts,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (err) {
    console.error("getMyPosts error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch posts",
    });
  }
};

// Update post
exports.updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.publicUserId;
    const { caption, location, latitude, longitude, is_published } = req.body;

    const post = await models.Post.findByPk(postId);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    if (post.public_user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this post",
      });
    }

    const updates = {};
    if (caption !== undefined) updates.caption = caption.trim();
    if (location !== undefined) updates.location = location;
    if (latitude !== undefined)
      updates.latitude = latitude ? parseFloat(latitude) : null;
    if (longitude !== undefined)
      updates.longitude = longitude ? parseFloat(longitude) : null;
    if (is_published !== undefined) updates.is_published = !!is_published;

    await post.update(updates);

    const updatedPost = await PostModel.findByPk(postId, {
      include: [
        {
          model: PublicUserModel,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
      ],
    });

    return res.json({
      success: true,
      message: "Post updated successfully",
      data: { post: updatedPost },
    });
  } catch (err) {
    console.error("updatePost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update post",
    });
  }
};

// Delete post
exports.deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.publicUserId;
    const fs = require("fs");

    const post = await models.Post.findByPk(postId);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    if (post.public_user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this post",
      });
    }

    // Delete media file from filesystem if it exists
    if (post.media_url) {
      const fullPath = path.join(
        __dirname,
        "..",
        "..",
        "uploads",
        post.media_url
      );
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (err) {
          console.error("Error deleting post media file:", err);
        }
      }
    }

    // Delete thumbnail if it exists
    if (post.thumbnail_url) {
      const thumbnailPath = path.join(
        __dirname,
        "..",
        "..",
        "uploads",
        post.thumbnail_url
      );
      if (fs.existsSync(thumbnailPath)) {
        try {
          fs.unlinkSync(thumbnailPath);
        } catch (err) {
          console.error("Error deleting post thumbnail:", err);
        }
      }
    }

    // Delete related records manually (since database foreign key doesn't have CASCADE)
    // 1. Delete all comment reactions for comments on this post
    const comments = await PostCommentModel.findAll({
      where: { post_id: postId },
    });
    const commentIds = comments.map((comment) => comment.id);

    if (commentIds.length > 0) {
      // Delete all comment reactions
      await CommentReactionModel.destroy({
        where: { comment_id: { [Op.in]: commentIds } },
      });
    }

    // 2. Delete all comments on this post
    await PostCommentModel.destroy({
      where: { post_id: postId },
    });

    // 3. Delete all reactions on this post
    await PostReactionModel.destroy({
      where: { post_id: postId },
    });

    // 4. Delete all related notifications for the post owner
    // Delete any notifications that mention posts (reactions, comments, etc.)
    try {
      await NotificationModel.destroy({
        where: {
          public_user_id: post.public_user_id,
          title: {
            [Op.like]: "%Post%",
          },
        },
      });
    } catch (notifErr) {
      console.error("Error deleting post-related notifications:", notifErr);
    }

    // 5. Broadcast SSE event to all connected users before deleting
    //    can remove the deleted post from their feed in real-time
    try {
      broadcastToAll("post:deleted", {
        postId: post.id,
        userId: userId,
      });
      console.log("📡 [deletePost] SSE event broadcasted for post deletion:", post.id);
    } catch (err) {
      console.error("Failed to send SSE event for post deletion:", err);
    }

    // 6. Finally, delete the post itself
    await post.destroy();

    return res.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (err) {
    console.error("deletePost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete post",
    });
  }
};

// Add reaction to post
exports.addReaction = async (req, res) => {
  try {
    const { postId } = req.params;
    const { reaction_type = "like", emoji, emojis } = req.body;
    const userId = req.publicUserId;

    console.log("🔵 [addReaction] Request received:", {
      postId,
      reaction_type,
      emoji,
      emojis,
      userId,
      timestamp: new Date().toISOString(),
    });

    // Handle multiple emojis: if emojis array is provided, join them; otherwise use single emoji
    let emojiString = null;
    if (emojis && Array.isArray(emojis) && emojis.length > 0) {
      // Join multiple emojis with comma separator (same as stories)
      emojiString = emojis.join(",");
      console.log("📝 [addReaction] Multiple emojis received, joined:", emojiString);
    } else if (emoji) {
      emojiString = emoji;
    }

    // Fetch post without include to avoid association issues
    // We don't need user data here, just post data
    const post = await PostModel.findByPk(postId);
    if (!post) {
      console.log("❌ [addReaction] Post not found:", postId);
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    console.log("✅ [addReaction] Post found:", {
      postId: post.id,
      currentLikeCount: post.like_count,
      currentReactionCount: post.reaction_count,
      moderationStatus: post.moderation_status,
    });

    // Prevent all interactions on posts that are not approved (including from owner)
    if (post.moderation_status !== "approved") {
      console.log("❌ [addReaction] Post not approved - interactions disabled:", {
        postId: post.id,
        moderationStatus: post.moderation_status,
        userId,
      });
      return res.status(403).json({
        success: false,
        message: "Cannot interact with post until it is approved",
      });
    }

    // Get the user who is reacting
    const reactingUser = await PublicUserModel.findByPk(userId, {
      attributes: ["id", "name", "username"],
    });

    console.log("👤 [addReaction] Reacting user:", {
      userId,
      username: reactingUser?.username,
      name: reactingUser?.name,
    });

    // Validate userId is present
    if (!userId) {
      console.log("❌ [addReaction] No userId provided");
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // For likes (not emoji), check if THIS USER already liked - toggle behavior
    if (!emoji && reaction_type === "like") {
      console.log("🔍 [addReaction] Checking for existing like:", {
        postId,
        userId,
        reaction_type: "like",
      });

      // First, check ALL likes for this post to see what's in the database
      const allLikesForPost = await PostReactionModel.findAll({
        where: {
          post_id: postId,
          reaction_type: "like",
          emoji: null,
        },
      });

      console.log("📋 [addReaction] ALL likes for this post:", {
        totalLikes: allLikesForPost.length,
        likes: allLikesForPost.map((like) => ({
          id: like.id,
          user_id: like.user_id,
          post_id: like.post_id,
          createdAt: like.createdAt,
        })),
      });

      const existingLike = await PostReactionModel.findOne({
        where: {
          post_id: postId,
          user_id: userId, // Only check for THIS specific user's like
          reaction_type: "like",
          emoji: null,
        },
      });

      console.log("🔍 [addReaction] Existing like check result:", {
        found: !!existingLike,
        existingLikeId: existingLike?.id,
        existingLikeUserId: existingLike?.user_id,
        checkingUserId: userId,
        match: existingLike?.user_id === userId,
      });

      if (existingLike) {
        console.log("🗑️ [addReaction] User already liked - REMOVING like:", {
          existingLikeId: existingLike.id,
          userId,
          postId,
          currentLikeCount: post.like_count,
        });

        // THIS USER already liked, remove their like (unlike)
        await existingLike.destroy();

        // Decrement only like_count and reaction_count
        await post.decrement("like_count");
        await post.decrement("reaction_count");

        // Reload post to get updated counts
        await post.reload();

        // Ensure counts are never negative (safety check)
        const likeCount = Math.max(0, post.like_count || 0);
        const reactionCount = Math.max(0, post.reaction_count || 0);

        console.log("✅ [addReaction] Like REMOVED - Response:", {
          removed: true,
          like_count: likeCount,
          reaction_count: reactionCount,
          userId,
          postId,
        });

        // Broadcast SSE event to all connected users for real-time updates
        try {
          broadcastToAll("post:reacted", {
            postId: post.id,
            like_count: likeCount,
            emoji_reaction_count: Math.max(0, post.emoji_reaction_count || 0),
            reaction_count: reactionCount,
            userId,
            reactionType: "like",
            removed: true,
          });
        } catch (err) {
          console.error("Failed to send SSE event for post reaction removal:", err);
        }

        return res.json({
          success: true,
          message: "Like removed",
          data: {
            removed: true,
            like_count: likeCount,
            reaction_count: reactionCount,
          },
        });
      } else {
        console.log(
          "✅ [addReaction] No existing like found - will CREATE new like"
        );
      }
    }

    // Create a new reaction (for emoji reactions, allow multiple; for likes, this is first like for THIS USER)
    console.log("➕ [addReaction] Creating new reaction:", {
      postId,
      userId,
      reaction_type: emojiString ? "emoji" : reaction_type,
      emoji: emojiString || null,
    });

    let reaction;
    try {
      reaction = await PostReactionModel.create({
        post_id: postId,
        user_id: userId,
        reaction_type: emojiString ? "emoji" : reaction_type,
        emoji: emojiString || null,
      });
      console.log("✅ [addReaction] Reaction created successfully:", {
        reactionId: reaction.id,
        userId: reaction.user_id,
        postId: reaction.post_id,
        reactionType: reaction.reaction_type,
      });
    } catch (createError) {
      // Handle unique constraint violation (shouldn't happen after fix, but just in case)
      if (
        createError.name === "SequelizeUniqueConstraintError" ||
        createError.original?.code === "23505"
      ) {
        console.error(
          "⚠️ [addReaction] Unique constraint violation when creating reaction:",
          {
            error: createError.message,
            code: createError.original?.code,
            postId,
            userId,
          }
        );
        // Check if reaction already exists (race condition)
        const existingReaction = await PostReactionModel.findOne({
          where: {
            post_id: postId,
            user_id: userId,
            reaction_type: emojiString ? "emoji" : reaction_type,
            emoji: emojiString || null,
          },
        });

        if (existingReaction) {
          console.log(
            "✅ [addReaction] Found existing reaction (race condition):",
            {
              reactionId: existingReaction.id,
            }
          );
          // Reaction already exists, return existing one
          reaction = existingReaction;
        } else {
          throw createError;
        }
      } else {
        console.error("❌ [addReaction] Error creating reaction:", {
          error: createError.message,
          name: createError.name,
          postId,
          userId,
        });
        throw createError;
      }
    }

    // Update only the relevant count based on reaction type
    console.log("📊 [addReaction] Updating counts - before:", {
      like_count: post.like_count,
      emoji_reaction_count: post.emoji_reaction_count,
      reaction_count: post.reaction_count,
    });

    if (emojiString) {
      // For emoji reactions, count each individual emoji (comma-separated)
      // Split by comma and count the number of emojis
      const emojiCount = emojiString.split(",").filter(e => e.trim()).length;
      
      // Increment emoji_reaction_count by the number of emojis (not just 1)
      await post.increment("emoji_reaction_count", { by: emojiCount });
      // reaction_count still increments by 1 (one reaction record)
      await post.increment("reaction_count");
      console.log(
        `📈 [addReaction] Incremented emoji_reaction_count by ${emojiCount} (${emojiCount} emojis) and reaction_count by 1`
      );
    } else if (reaction_type === "like") {
      // For likes, increment like_count and reaction_count
      await post.increment("like_count");
      await post.increment("reaction_count");
      console.log("📈 [addReaction] Incremented like_count and reaction_count");
    }

    // Reload post to get updated counts
    await post.reload();

    // Ensure counts are never negative (safety check)
    const likeCount = Math.max(0, post.like_count || 0);
    const emojiCount = Math.max(0, post.emoji_reaction_count || 0);
    const reactionCount = Math.max(0, post.reaction_count || 0);

    console.log("📊 [addReaction] Updated counts - after:", {
      like_count: likeCount,
      emoji_reaction_count: emojiCount,
      reaction_count: reactionCount,
    });

    // Create notification for post owner (don't notify for own reactions)
    if (post.public_user_id !== userId) {
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

        await NotificationModel.create({
          public_user_id: post.public_user_id,
          title: "New Reaction on Your Post",
          message: `${userName} reacted to your post with ${reactionDisplay}`,
          isRead: false,
        });
      } catch (notifErr) {
        console.error("Failed to create reaction notification:", notifErr);
      }
    }

    // For likes, also return the reaction so frontend can update user_reaction state
    const responseData = {
      reaction,
      like_count: likeCount,
      emoji_reaction_count: emojiCount,
      reaction_count: reactionCount,
    };

    // If it's a like (not emoji), include it in response for frontend state update
    if (reaction_type === "like" && !emoji) {
      responseData.user_reaction = reaction;
    }

    console.log("✅ [addReaction] Success - Sending response:", {
      success: true,
      like_count: likeCount,
      emoji_reaction_count: emojiCount,
      reaction_count: reactionCount,
      hasUserReaction: !!responseData.user_reaction,
      userId,
      postId,
    });

    // Broadcast SSE event to all connected users for real-time updates
    try {
      await post.reload();
      
      // Get recent emoji reactions for the SSE event (same format as feed)
      const emojiReactionsForSSE = await PostReactionModel.findAll({
        where: {
          post_id: post.id,
          emoji: { [Op.not]: null },
          reaction_type: "emoji",
        },
        include: [
          {
            model: PublicUserModel,
            as: "user",
            attributes: ["id"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });
      
      // Extract unique emojis: split comma-separated emojis and get first emoji from each user's most recent reaction
      const userEmojiMap = new Map();
      const recentEmojis = [];
      
      for (const reaction of emojiReactionsForSSE) {
        if (!reaction.emoji) continue;
        
        const reactionUserId = reaction.user?.id || reaction.user_id;
        
        // Skip if we already have an emoji from this user
        if (userEmojiMap.has(reactionUserId)) continue;
        
        // Split comma-separated emojis and take the first one
        const firstEmoji = reaction.emoji.split(",")[0].trim();
        if (firstEmoji) {
          recentEmojis.push(firstEmoji);
          userEmojiMap.set(reactionUserId, true);
          
          // Stop after collecting 3 unique emojis (one per user)
          if (recentEmojis.length >= 3) break;
        }
      }
      
      broadcastToAll("post:reacted", {
        postId: post.id,
        like_count: likeCount,
        emoji_reaction_count: emojiCount,
        reaction_count: reactionCount,
        recent_emoji_reactions: recentEmojis,
        userId,
        reactionType: emojiString ? "emoji" : reaction_type,
        emoji: emojiString || null,
      });
    } catch (err) {
      console.error("Failed to send SSE event for post reaction:", err);
    }

    return res.json({
      success: true,
      message: "Reaction added",
      data: responseData,
    });
  } catch (err) {
    console.error("❌ [addReaction] Error:", {
      error: err.message,
      stack: err.stack,
      name: err.name,
      postId: req.params.postId,
      userId: req.publicUserId,
    });
    return res.status(500).json({
      success: false,
      message: "Failed to add reaction",
    });
  }
};

// Remove reaction from post
exports.removeReaction = async (req, res) => {
  try {
    const { postId, reactionId } = req.params;
    const userId = req.publicUserId;

    // If reactionId is provided, remove that specific reaction
    // Otherwise, remove the most recent reaction from this user for this post
    let reaction;

    if (reactionId) {
      reaction = await PostReaction.findOne({
        where: { id: reactionId, post_id: postId, user_id: userId },
      });
    } else {
      reaction = await PostReaction.findOne({
        where: { post_id: postId, user_id: userId },
        order: [["createdAt", "DESC"]],
      });
    }

    if (!reaction) {
      return res
        .status(404)
        .json({ success: false, message: "Reaction not found" });
    }

    const reactionType = reaction.reaction_type;
    const hasEmoji = !!reaction.emoji;

    await reaction.destroy();

    // Update appropriate reaction count
    const post = await models.Post.findByPk(postId);
    if (post) {
      if (hasEmoji || reactionType === "emoji") {
        // Count the number of emojis in the reaction being removed
        const emojiCount = reaction.emoji 
          ? reaction.emoji.split(",").filter(e => e.trim()).length 
          : 1;
        // Decrement emoji_reaction_count by the number of emojis
        await post.decrement("emoji_reaction_count", { by: emojiCount });
        console.log(
          `📉 [removeReaction] Decremented emoji_reaction_count by ${emojiCount} (removed ${emojiCount} emojis)`
        );
      } else if (reactionType === "like") {
        await post.decrement("like_count");
      }
      // Also update total reaction count for backward compatibility
      await post.decrement("reaction_count");
      
      // Reload post to get updated counts
      await post.reload();
      
      // Broadcast SSE event to all connected users for real-time updates
      try {
        const likeCount = Math.max(0, post.like_count || 0);
        const emojiCount = Math.max(0, post.emoji_reaction_count || 0);
        const reactionCount = Math.max(0, post.reaction_count || 0);
        
        // Get recent emoji reactions for the SSE event (same format as feed)
        const emojiReactionsForSSE = await PostReactionModel.findAll({
          where: {
            post_id: post.id,
            emoji: { [Op.not]: null },
            reaction_type: "emoji",
          },
          include: [
            {
              model: PublicUserModel,
              as: "user",
              attributes: ["id"],
            },
          ],
          order: [["createdAt", "DESC"]],
        });
        
        // Extract unique emojis: split comma-separated emojis and get first emoji from each user's most recent reaction
        const userEmojiMap = new Map();
        const recentEmojis = [];
        
        for (const reaction of emojiReactionsForSSE) {
          if (!reaction.emoji) continue;
          
          const reactionUserId = reaction.user?.id || reaction.user_id;
          
          // Skip if we already have an emoji from this user
          if (userEmojiMap.has(reactionUserId)) continue;
          
          // Split comma-separated emojis and take the first one
          const firstEmoji = reaction.emoji.split(",")[0].trim();
          if (firstEmoji) {
            recentEmojis.push(firstEmoji);
            userEmojiMap.set(reactionUserId, true);
            
            // Stop after collecting 3 unique emojis (one per user)
            if (recentEmojis.length >= 3) break;
          }
        }
        
        broadcastToAll("post:reacted", {
          postId: post.id,
          like_count: likeCount,
          emoji_reaction_count: emojiCount,
          reaction_count: reactionCount,
          recent_emoji_reactions: recentEmojis,
          userId: req.publicUserId,
          reactionType: hasEmoji ? "emoji" : reactionType,
          removed: true,
        });
      } catch (err) {
        console.error("Failed to send SSE event for post reaction removal:", err);
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

// Add comment to post
exports.addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, parent_comment_id } = req.body;
    const userId = req.publicUserId;

    console.log("💬 [addComment] Request received:", {
      postId,
      content: content?.substring(0, 50),
      parent_comment_id,
      userId,
      hasContent: !!content,
      contentLength: content?.length,
    });

    if (!content || !content.trim()) {
      console.log("❌ [addComment] No content provided");
      return res
        .status(400)
        .json({ success: false, message: "Comment content is required" });
    }

    if (!userId) {
      console.log("❌ [addComment] No userId found");
      return res
        .status(401)
        .json({ success: false, message: "User authentication required" });
    }

    const post = await models.Post.findByPk(postId, {
      include: [
        {
          model: models.PublicUser,
          as: "user",
          attributes: ["id", "name", "username"],
        },
      ],
    });
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // Prevent all interactions on posts that are not approved (including from owner)
    if (post.moderation_status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Cannot comment on post until it is approved",
      });
    }

    // Get the user who is commenting
    const commentingUser = await PublicUser.findByPk(userId, {
      attributes: ["id", "name", "username"],
    });

    const comment = await PostComment.create({
      post_id: postId,
      user_id: userId,
      content: content.trim(),
      parent_comment_id: parent_comment_id || null,
    });

    // Update comment count
    await post.increment("comment_count");
    await post.reload();

    // Fetch comment with user details
    const commentWithUser = await PostComment.findByPk(comment.id, {
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username", "photo"],
        },
      ],
    });

    // Broadcast SSE event to all connected users for real-time updates
    try {
      broadcastToAll("post:commented", {
        postId: post.id,
        commentId: comment.id,
        comment_count: post.comment_count || 0,
        userId,
        parent_comment_id: parent_comment_id || null,
      });
    } catch (err) {
      console.error("Failed to send SSE event for post comment:", err);
    }

    // Create notification for post owner (don't notify for own comments)
    if (post.public_user_id !== userId) {
      try {
        const userName =
          commentingUser?.name || commentingUser?.username || "Someone";
        const commentPreview =
          content.trim().length > 50
            ? content.trim().substring(0, 50) + "..."
            : content.trim();
        await Notification.create({
          public_user_id: post.public_user_id,
          title: "New Comment on Your Post",
          message: `${userName} commented: "${commentPreview}"`,
          isRead: false,
        });
      } catch (notifErr) {
        console.error("Failed to create comment notification:", notifErr);
      }
    }

    return res.status(201).json({
      success: true,
      message: "Comment added",
      data: { comment: commentWithUser },
    });
  } catch (err) {
    console.error("addComment error:", err);
    console.error("Error details:", {
      message: err.message,
      stack: err.stack,
      postId: req.params.postId,
      userId: req.publicUserId,
    });
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to add comment",
    });
  }
};

// Delete comment
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.publicUserId;

    const comment = await PostComment.findOne({
      where: { id: commentId, user_id: userId },
    });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    }

    const postId = comment.post_id;
    await comment.destroy();

    // Update comment count
    const post = await models.Post.findByPk(postId);
    if (post) {
      await post.decrement("comment_count");
      await post.reload();
      
      // Broadcast SSE event to all connected users for real-time updates
      try {
        broadcastToAll("post:commented", {
          postId: post.id,
          commentId: commentId,
          comment_count: post.comment_count || 0,
          userId,
          deleted: true,
        });
      } catch (err) {
        console.error("Failed to send SSE event for post comment deletion:", err);
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

// Add reaction to comment
exports.addCommentReaction = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { reaction_type = "like", emoji } = req.body;
    const userId = req.publicUserId;

    const comment = await PostComment.findByPk(commentId, {
      include: [
        {
          model: Post,
          as: "post",
          attributes: ["id", "public_user_id", "moderation_status"],
        },
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username"],
        },
      ],
    });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    }

    // Check if post is viewable
    if (
      comment.post.public_user_id !== userId &&
      comment.post.moderation_status !== "approved"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Comment not available" });
    }

    // Always create a new reaction (allow multiple reactions per user)
    const reaction = await CommentReaction.create({
      comment_id: commentId,
      user_id: userId,
      reaction_type: emoji ? "emoji" : reaction_type,
      emoji: emoji || null,
    });

    // Update reaction count
    await comment.increment("reaction_count");
    await comment.reload();

    // Broadcast SSE event to all connected users for real-time updates
    try {
      broadcastToAll("comment:reacted", {
        postId: comment.post.id,
        commentId: comment.id,
        reaction_count: comment.reaction_count || 0,
        userId,
        reactionType: emoji ? "emoji" : reaction_type,
        emoji: emoji || null,
      });
    } catch (err) {
      console.error("Failed to send SSE event for comment reaction:", err);
    }

    // Create notification for comment owner (don't notify for own reactions)
    if (comment.user_id !== userId) {
      try {
        const reactingUser = await PublicUser.findByPk(userId, {
          attributes: ["id", "name", "username"],
        });
        const reactionDisplay = emoji || reaction_type;
        const userName =
          reactingUser?.name || reactingUser?.username || "Someone";
        await Notification.create({
          public_user_id: comment.user_id,
          title: "New Reaction on Your Comment",
          message: `${userName} reacted to your comment with ${reactionDisplay}`,
          isRead: false,
        });
      } catch (notifErr) {
        console.error(
          "Failed to create comment reaction notification:",
          notifErr
        );
      }
    }

    return res.json({
      success: true,
      message: "Reaction added",
      data: { reaction },
    });
  } catch (err) {
    console.error("addCommentReaction error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add reaction",
    });
  }
};

// Remove reaction from comment
exports.removeCommentReaction = async (req, res) => {
  try {
    const { commentId, reactionId } = req.params;
    const userId = req.publicUserId;

    // If reactionId is provided, remove that specific reaction
    // Otherwise, remove the most recent reaction from this user for this comment
    let reaction;

    if (reactionId) {
      reaction = await CommentReaction.findOne({
        where: { id: reactionId, comment_id: commentId, user_id: userId },
      });
    } else {
      reaction = await CommentReaction.findOne({
        where: { comment_id: commentId, user_id: userId },
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
    const comment = await PostComment.findByPk(commentId, {
      include: [
        {
          model: Post,
          as: "post",
          attributes: ["id"],
        },
      ],
    });
    if (comment) {
      await comment.decrement("reaction_count");
      await comment.reload();
      
      // Broadcast SSE event to all connected users for real-time updates
      try {
        broadcastToAll("comment:reacted", {
          postId: comment.post.id,
          commentId: comment.id,
          reaction_count: comment.reaction_count || 0,
          userId: req.publicUserId,
          removed: true,
        });
      } catch (err) {
        console.error("Failed to send SSE event for comment reaction removal:", err);
      }
    }

    return res.json({
      success: true,
      message: "Reaction removed",
    });
  } catch (err) {
    console.error("removeCommentReaction error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to remove reaction",
    });
  }
};

// Add reaction to comment
exports.addCommentReaction = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { reaction_type = "like", emoji } = req.body;
    const userId = req.publicUserId;

    const comment = await PostComment.findByPk(commentId, {
      include: [
        {
          model: Post,
          as: "post",
          attributes: ["id", "public_user_id", "moderation_status"],
        },
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username"],
        },
      ],
    });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    }

    // Check if post is viewable
    if (
      comment.post.public_user_id !== userId &&
      comment.post.moderation_status !== "approved"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Comment not available" });
    }

    // Always create a new reaction (allow multiple reactions per user)
    const reaction = await CommentReaction.create({
      comment_id: commentId,
      user_id: userId,
      reaction_type: emoji ? "emoji" : reaction_type,
      emoji: emoji || null,
    });

    // Update reaction count
    await comment.increment("reaction_count");
    await comment.reload();

    // Broadcast SSE event to all connected users for real-time updates
    try {
      broadcastToAll("comment:reacted", {
        postId: comment.post.id,
        commentId: comment.id,
        reaction_count: comment.reaction_count || 0,
        userId,
        reactionType: emoji ? "emoji" : reaction_type,
        emoji: emoji || null,
      });
    } catch (err) {
      console.error("Failed to send SSE event for comment reaction:", err);
    }

    // Create notification for comment owner (don't notify for own reactions)
    if (comment.user_id !== userId) {
      try {
        const reactingUser = await PublicUser.findByPk(userId, {
          attributes: ["id", "name", "username"],
        });
        const reactionDisplay = emoji || reaction_type;
        const userName =
          reactingUser?.name || reactingUser?.username || "Someone";
        await Notification.create({
          public_user_id: comment.user_id,
          title: "New Reaction on Your Comment",
          message: `${userName} reacted to your comment with ${reactionDisplay}`,
          isRead: false,
        });
      } catch (notifErr) {
        console.error(
          "Failed to create comment reaction notification:",
          notifErr
        );
      }
    }

    return res.json({
      success: true,
      message: "Reaction added",
      data: { reaction },
    });
  } catch (err) {
    console.error("addCommentReaction error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add reaction",
    });
  }
};

// Remove reaction from comment
exports.removeCommentReaction = async (req, res) => {
  try {
    const { commentId, reactionId } = req.params;
    const userId = req.publicUserId;

    // If reactionId is provided, remove that specific reaction
    // Otherwise, remove the most recent reaction from this user for this comment
    let reaction;

    if (reactionId) {
      reaction = await CommentReaction.findOne({
        where: { id: reactionId, comment_id: commentId, user_id: userId },
      });
    } else {
      reaction = await CommentReaction.findOne({
        where: { comment_id: commentId, user_id: userId },
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
    const comment = await PostComment.findByPk(commentId);
    if (comment) {
      await comment.decrement("reaction_count");
    }

    return res.json({
      success: true,
      message: "Reaction removed",
    });
  } catch (err) {
    console.error("removeCommentReaction error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to remove reaction",
    });
  }
};

// Get posts for moderation (admin)
exports.getPostsForModeration = async (req, res) => {
  try {
    const { status = "pending", limit = 50, offset = 0 } = req.query;

    const posts = await PostModel.findAll({
      where: {
        moderation_status: status,
      },
      include: [
        {
          model: PublicUserModel,
          as: "user",
          attributes: ["id", "name", "username", "photo", "email"],
        },
      ],
      order: [["createdAt", "ASC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const total = await PostModel.count({
      where: { moderation_status: status },
    });

    return res.json({
      success: true,
      data: {
        posts,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (err) {
    console.error("getPostsForModeration error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch posts for moderation",
    });
  }
};

// Approve post (admin)
exports.approvePost = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await models.Post.findByPk(postId, {
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
      ],
    });
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    await post.update({ moderation_status: "approved" });
    await post.reload({
      include: [
        {
          model: PublicUser,
          as: "user",
          attributes: ["id", "name", "username", "photo", "isVerified"],
        },
      ],
    });

    // Send notification to post creator
    if (post.public_user_id) {
      try {
        await NotificationModel.create({
          public_user_id: post.public_user_id,
          type: "post_approved",
          title: "Post Approved",
          message: "Your post has been approved and is now visible to others.",
          isRead: false,
          data: { post_id: post.id },
        });
      } catch (notifErr) {
        console.error("Failed to create post approval notification:", notifErr);
      }
    }

    // Broadcast SSE event to all connected users so they can see the newly approved post
    try {
      // Get emoji reactions for the post (formatted same as feed)
      const emojiReactions = await PostReactionModel.findAll({
        where: {
          post_id: post.id,
          emoji: { [Op.not]: null },
          reaction_type: "emoji",
        },
        include: [
          {
            model: PublicUserModel,
            as: "user",
            attributes: ["id"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });
      
      // Extract unique emojis: split comma-separated emojis and get first emoji from each user's most recent reaction
      const userEmojiMap = new Map(); // Track which emoji we've shown per user
      const recentEmojis = [];
      
      for (const reaction of emojiReactions) {
        if (!reaction.emoji) continue;
        
        const reactionUserId = reaction.user?.id || reaction.user_id;
        
        // Skip if we already have an emoji from this user
        if (userEmojiMap.has(reactionUserId)) continue;
        
        // Split comma-separated emojis and take the first one
        const firstEmoji = reaction.emoji.split(",")[0].trim();
        if (firstEmoji) {
          recentEmojis.push(firstEmoji);
          userEmojiMap.set(reactionUserId, true);
          
          // Stop after collecting 3 unique emojis (one per user)
          if (recentEmojis.length >= 3) break;
        }
      }

      // Format post data for SSE (exactly like feed format)
      const postData = {
        id: post.id,
        caption: post.caption,
        media_url: post.media_url,
        media_type: post.media_type,
        location: post.location,
        moderation_status: post.moderation_status,
        is_published: post.is_published,
        like_count: post.like_count || 0,
        emoji_reaction_count: post.emoji_reaction_count || 0,
        reaction_count: post.reaction_count || 0,
        comment_count: post.comment_count || 0,
        recent_emoji_reactions: recentEmojis,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        public_user_id: post.public_user_id,
        user: post.user ? {
          id: post.user.id,
          name: post.user.name,
          username: post.user.username,
          photo: post.user.photo,
          isVerified: post.user.isVerified,
        } : null,
        user_reaction: null, // Each user will get their own when they view it
      };

      console.log("📡 [approvePost] Broadcasting post:approved SSE event:", {
        postId: post.id,
        hasPostData: !!postData,
        moderationStatus: postData.moderation_status,
        isPublished: postData.is_published,
      });

      // Broadcast as post:approved event
      broadcastToAll("post:approved", {
        postId: post.id,
        post: postData,
        userId: post.public_user_id,
        type: "approved",
      });

      // Also broadcast as post:new for compatibility (frontend handles both)
      // This ensures the post appears in feeds even if post:approved handler has issues
      broadcastToAll("post:new", {
        post: postData,
        postId: post.id,
      });
    } catch (err) {
      console.error("Failed to send SSE event for post approval:", err);
    }

    return res.json({
      success: true,
      message: "Post approved",
      data: { post },
    });
  } catch (err) {
    console.error("approvePost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to approve post",
    });
  }
};

// Reject post (admin)
exports.rejectPost = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await models.Post.findByPk(postId);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    await post.update({ moderation_status: "rejected" });

    return res.json({
      success: true,
      message: "Post rejected",
      data: { post },
    });
  } catch (err) {
    console.error("rejectPost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to reject post",
    });
  }
};

// Share post
exports.sharePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { share_type } = req.body; // 'link', 'native', 'twitter', 'facebook', 'whatsapp', etc.

    const post = await PostModel.findByPk(postId);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    // Check if user can view post (own post or approved)
    if (
      post.public_user_id !== req.publicUserId &&
      post.moderation_status !== "approved"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Post not available" });
    }

    // Increment share count
    await post.increment("share_count");

    // Fetch updated post
    const updatedPost = await PostModel.findByPk(postId, {
      attributes: ["id", "share_count"],
    });

    // Broadcast share event via SSE
    broadcastToAll({
      type: "post:shared",
      postId: post.id,
      share_count: updatedPost.share_count,
    });

    return res.json({
      success: true,
      message: "Post shared successfully",
      data: {
        share_count: updatedPost.share_count,
        share_type: share_type || "link",
      },
    });
  } catch (err) {
    console.error("sharePost error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to share post",
    });
  }
};
