const { Op } = require("sequelize");
const {
  Story,
  StoryView,
  StoryReaction,
  StoryComment,
  Notification,
} = require("../models");
const fs = require("fs");
const path = require("path");

// Helper function to delete a story and all related records
// This matches the exact logic from deleteStory controller
exports.deleteStoryWithRelatedRecords = async (story) => {
  const storyId = story.id;

  // Delete all related records first to avoid foreign key constraint violations
  // Delete story reactions
  await StoryReaction.destroy({
    where: { story_id: storyId },
  });

  // Delete story views
  await StoryView.destroy({
    where: { story_id: storyId },
  });

  // Delete story comments (including replies)
  await StoryComment.destroy({
    where: { story_id: storyId },
  });

  // Delete media file if exists
  if (story.media_url) {
    const filePath = path.join(
      __dirname,
      "..",
      "..",
      "uploads",
      story.media_url
    );
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Error deleting media file for story ${storyId}:`, err);
      }
    }
  }

  // Delete thumbnail if exists
  if (story.thumbnail_url) {
    const thumbPath = path.join(
      __dirname,
      "..",
      "..",
      "uploads",
      story.thumbnail_url
    );
    if (fs.existsSync(thumbPath)) {
      try {
        fs.unlinkSync(thumbPath);
      } catch (err) {
        console.error(`Error deleting thumbnail for story ${storyId}:`, err);
      }
    }
  }

  // Delete all related notifications for the story owner
  // Delete any notifications that mention stories (reactions, comments, approvals, etc.)
  try {
    await Notification.destroy({
      where: {
        public_user_id: story.public_user_id,
        title: {
          [Op.like]: "%Story%",
        },
      },
    });
  } catch (notifErr) {
    console.error(
      `Error deleting story-related notifications for story ${storyId}:`,
      notifErr
    );
  }

  // Now delete the story itself
  await story.destroy();
};

// Clean up expired stories
exports.cleanupExpiredStories = async () => {
  try {
    const expiredStories = await Story.findAll({
      where: {
        expires_at: { [Op.lt]: new Date() },
        is_highlight: false, // Don't delete highlighted stories
      },
    });

    let deletedCount = 0;
    let errorCount = 0;

    for (const story of expiredStories) {
      try {
        // Use the same deletion logic as deleteStory function
        await exports.deleteStoryWithRelatedRecords(story);
        deletedCount++;
      } catch (err) {
        console.error(`Error deleting story ${story.id}:`, err);
        errorCount++;
      }
    }

    console.log(
      `[Story Cleanup] Deleted ${deletedCount} expired stories. Errors: ${errorCount}`
    );
    return { deletedCount, errorCount };
  } catch (err) {
    console.error("[Story Cleanup] Error:", err);
    throw err;
  }
};

// Publish scheduled stories
exports.publishScheduledStories = async () => {
  try {
    const now = new Date();
    const scheduledStories = await Story.findAll({
      where: {
        scheduled_at: { [Op.lte]: now },
        is_published: false,
      },
    });

    let publishedCount = 0;
    for (const story of scheduledStories) {
      await story.update({
        is_published: true,
        scheduled_at: null,
      });
      publishedCount++;
    }

    if (publishedCount > 0) {
      console.log(
        `[Story Service] Published ${publishedCount} scheduled stories`
      );
    }

    return { publishedCount };
  } catch (err) {
    console.error("[Story Service] Error publishing scheduled stories:", err);
    throw err;
  }
};

// Update challenge participant counts
exports.updateChallengeCounts = async () => {
  try {
    const { StoryChallenge } = require("../models");
    const challenges = await StoryChallenge.findAll({
      where: { is_active: true },
    });

    for (const challenge of challenges) {
      const count = await Story.count({
        where: {
          challenge_id: challenge.id,
          is_published: true,
          moderation_status: "approved",
          expires_at: { [Op.gt]: new Date() },
        },
      });

      await challenge.update({ participant_count: count });
    }

    console.log("[Story Service] Updated challenge participant counts");
  } catch (err) {
    console.error("[Story Service] Error updating challenge counts:", err);
    throw err;
  }
};

// Clean up orphaned reactions and comments (references to non-existent stories)
exports.cleanupOrphanedRecords = async () => {
  try {
    // Get all existing story IDs
    const existingStoryIds = await Story.findAll({
      attributes: ["id"],
      raw: true,
    }).then((stories) => stories.map((s) => s.id));

    if (existingStoryIds.length === 0) {
      return { deletedReactions: 0, deletedComments: 0, deletedViews: 0 };
    }

    // Find and delete orphaned reactions
    const orphanedReactions = await StoryReaction.destroy({
      where: {
        story_id: { [Op.notIn]: existingStoryIds },
      },
    });

    // Find and delete orphaned comments
    const orphanedComments = await StoryComment.destroy({
      where: {
        story_id: { [Op.notIn]: existingStoryIds },
      },
    });

    // Find and delete orphaned views
    const orphanedViews = await StoryView.destroy({
      where: {
        story_id: { [Op.notIn]: existingStoryIds },
      },
    });

    if (orphanedReactions > 0 || orphanedComments > 0 || orphanedViews > 0) {
      console.log(
        `[Story Cleanup] Removed ${orphanedReactions} orphaned reactions, ${orphanedComments} orphaned comments, ${orphanedViews} orphaned views`
      );
    }

    return {
      deletedReactions: orphanedReactions,
      deletedComments: orphanedComments,
      deletedViews: orphanedViews,
    };
  } catch (err) {
    console.error("[Story Cleanup] Error cleaning orphaned records:", err);
    throw err;
  }
};

// Get story statistics
exports.getStoryStats = async (userId) => {
  try {
    const totalStories = await Story.count({
      where: { public_user_id: userId },
    });

    const activeStories = await Story.count({
      where: {
        public_user_id: userId,
        expires_at: { [Op.gt]: new Date() },
        is_published: true,
      },
    });

    const totalViews = await Story.sum("view_count", {
      where: { public_user_id: userId },
    });

    const totalReactions = await Story.sum("reaction_count", {
      where: { public_user_id: userId },
    });

    return {
      totalStories,
      activeStories,
      totalViews: totalViews || 0,
      totalReactions: totalReactions || 0,
    };
  } catch (err) {
    console.error("[Story Service] Error getting stats:", err);
    throw err;
  }
};
