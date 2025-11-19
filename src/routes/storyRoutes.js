const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/storyController");
const {
  authenticatePublic,
  optionalPublicAuth,
} = require("../middleware/publicAuth");
const {
  uploadStoryMedia,
  handleUploadError,
} = require("../middleware/upload");

// Create story
router.post(
  "/",
  authenticatePublic,
  uploadStoryMedia,
  handleUploadError,
  ctrl.createStory
);

// Get stories feed (must be before /:storyId)
router.get("/feed", optionalPublicAuth, ctrl.getStoriesFeed);

// Get nearby stories (location-based) (must be before /:storyId)
router.get("/nearby", optionalPublicAuth, ctrl.getNearbyStories);

// Get user's own stories (must be before /:storyId)
router.get("/me/stories", authenticatePublic, ctrl.getMyStories);

// Challenges (must be before /:storyId)
router.get("/challenges", optionalPublicAuth, ctrl.getChallenges);

// Highlights routes (must be before /:storyId)
router.post("/highlights", authenticatePublic, ctrl.createHighlight);
router.get("/highlights", optionalPublicAuth, ctrl.getHighlights);
router.get("/highlights/:userId", optionalPublicAuth, ctrl.getHighlights);

// Analytics (must be before /:storyId)
router.get("/:storyId/analytics", authenticatePublic, ctrl.getStoryAnalytics);

// Reactions (must be before /:storyId)
router.post("/:storyId/reactions", authenticatePublic, ctrl.addReaction);
router.delete("/:storyId/reactions", authenticatePublic, ctrl.removeReaction);

// Comments
router.post("/:storyId/comments", authenticatePublic, ctrl.addComment);
router.delete("/comments/:commentId", authenticatePublic, ctrl.deleteComment);

// Get single story (must be last to avoid conflicts)
router.get("/:storyId", optionalPublicAuth, ctrl.getStory);

// Delete story
router.delete("/:storyId", authenticatePublic, ctrl.deleteStory);

module.exports = router;

