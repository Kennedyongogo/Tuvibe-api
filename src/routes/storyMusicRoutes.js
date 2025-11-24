const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/storyMusicController");
const { authenticateAdmin } = require("../middleware/auth");
const { optionalPublicAuth } = require("../middleware/publicAuth");
const {
  uploadMusicFiles,
  handleUploadError,
} = require("../middleware/upload");

// Public route: Get available music tracks (for users to select)
router.get("/available", optionalPublicAuth, ctrl.getAvailableMusic);

// Admin routes: Full CRUD operations
router.get("/", authenticateAdmin, ctrl.getAllMusic);
router.get("/:id", authenticateAdmin, ctrl.getMusicById);
router.post(
  "/",
  authenticateAdmin,
  uploadMusicFiles,
  handleUploadError,
  ctrl.createMusic
);
router.put(
  "/:id",
  authenticateAdmin,
  uploadMusicFiles,
  handleUploadError,
  ctrl.updateMusic
);
router.delete("/:id", authenticateAdmin, ctrl.deleteMusic);

module.exports = router;


