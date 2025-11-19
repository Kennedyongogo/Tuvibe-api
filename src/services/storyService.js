const { Op } = require("sequelize");
const { Story, StoryView, StoryReaction, StoryComment } = require("../models");
const fs = require("fs");
const path = require("path");

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
        // Delete associated views, reactions, and comments
        await StoryView.destroy({ where: { story_id: story.id } });
        await StoryReaction.destroy({ where: { story_id: story.id } });
        await StoryComment.destroy({ where: { story_id: story.id } });

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
            fs.unlinkSync(filePath);
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
            fs.unlinkSync(thumbPath);
          }
        }

        // Delete story record
        await story.destroy();
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

