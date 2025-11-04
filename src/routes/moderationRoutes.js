const express = require("express");
const router = express.Router();
const {
  getPending,
  approvePhoto,
  rejectPhoto,
  approveBio,
  rejectBio,
  bulkApprovePhotos,
  bulkApproveBios,
  approveGalleryPhoto,
  rejectGalleryPhoto,
} = require("../controllers/moderationController");
const {
  authenticateAdmin,
  requireAdminOrHigher,
} = require("../middleware/auth");

// All moderation routes require admin authentication
router.use(authenticateAdmin);
router.use(requireAdminOrHigher);

// Get pending moderation items
router.get("/pending", getPending);

// Photo moderation
router.post("/photo/:userId/approve", approvePhoto);
router.post("/photo/:userId/reject", rejectPhoto);

// Gallery photo moderation
router.post("/gallery-photo/:userId/:photoIndex/approve", approveGalleryPhoto);
router.post("/gallery-photo/:userId/:photoIndex/reject", rejectGalleryPhoto);

// Bio moderation
router.post("/bio/:userId/approve", approveBio);
router.post("/bio/:userId/reject", rejectBio);

// Bulk operations
router.post("/photos/bulk-approve", bulkApprovePhotos);
router.post("/bios/bulk-approve", bulkApproveBios);

module.exports = router;
