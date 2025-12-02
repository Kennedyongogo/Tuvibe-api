const express = require("express");
const router = express.Router();
const {
  authenticatePublic,
  optionalPublicAuth,
} = require("../middleware/publicAuth");
const ctrl = require("../controllers/ratingTestimonialController");

// Check if user should be prompted (authenticated)
router.get("/check-prompt", authenticatePublic, ctrl.checkShouldPrompt);

// Submit rating and testimonial (authenticated)
router.post("/submit", authenticatePublic, ctrl.submit);

// Dismiss rating prompt (authenticated)
router.post("/dismiss", authenticatePublic, ctrl.dismissPrompt);

// Get user's own rating/testimonial (authenticated)
router.get("/my-rating", authenticatePublic, ctrl.getMyRating);

// Get approved testimonials for public display (no auth required)
router.get("/testimonials", optionalPublicAuth, ctrl.getApprovedTestimonials);

// Get rating statistics (no auth required)
router.get("/stats", optionalPublicAuth, ctrl.getRatingStats);

module.exports = router;
