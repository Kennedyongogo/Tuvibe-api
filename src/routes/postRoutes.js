const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/postController");
const {
  authenticatePublic,
  optionalPublicAuth,
} = require("../middleware/publicAuth");
const { authenticateAdmin } = require("../middleware/auth");
const { uploadPostMedia, handleUploadError } = require("../middleware/upload");

// Create post
router.post(
  "/",
  authenticatePublic,
  uploadPostMedia,
  handleUploadError,
  ctrl.createPost
);

// Get posts feed (must be before /:postId)
router.get("/feed", optionalPublicAuth, ctrl.getPostsFeed);

// Get user's own posts (must be before /:postId)
router.get("/me/posts", authenticatePublic, ctrl.getMyPosts);

// Reactions (must be before /:postId)
router.post("/:postId/reactions", authenticatePublic, ctrl.addReaction);
// Remove specific reaction by ID
router.delete(
  "/:postId/reactions/:reactionId",
  authenticatePublic,
  ctrl.removeReaction
);
// Remove most recent reaction (no reactionId)
router.delete("/:postId/reactions", authenticatePublic, ctrl.removeReaction);

// Share post
router.post("/:postId/share", optionalPublicAuth, ctrl.sharePost);

// Comments
router.post("/:postId/comments", authenticatePublic, ctrl.addComment);
router.delete("/comments/:commentId", authenticatePublic, ctrl.deleteComment);

// Comment reactions
router.post(
  "/comments/:commentId/reactions",
  authenticatePublic,
  ctrl.addCommentReaction
);
router.delete(
  "/comments/:commentId/reactions/:reactionId",
  authenticatePublic,
  ctrl.removeCommentReaction
);
router.delete(
  "/comments/:commentId/reactions",
  authenticatePublic,
  ctrl.removeCommentReaction
);

// Update post (must be before DELETE /:postId)
router.put("/:postId", authenticatePublic, ctrl.updatePost);

// Delete post (must be before GET /:postId)
router.delete("/:postId", authenticatePublic, ctrl.deletePost);

// Admin moderation routes (must be before /:postId)
router.get("/admin/moderation", authenticateAdmin, ctrl.getPostsForModeration);
router.post("/admin/:postId/approve", authenticateAdmin, ctrl.approvePost);
router.post("/admin/:postId/reject", authenticateAdmin, ctrl.rejectPost);

// Get single post (must be last to avoid conflicts)
router.get("/:postId", optionalPublicAuth, ctrl.getPost);

module.exports = router;
