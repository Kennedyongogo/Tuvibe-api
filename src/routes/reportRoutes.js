const express = require("express");
const router = express.Router();
const {
  create,
  listMine,
  getMine,
  listAll,
  getOne,
  update,
  delete: deleteReport,
  stats,
} = require("../controllers/reportController");
const { authenticatePublic } = require("../middleware/publicAuth");
const {
  authenticateAdmin,
  requireAdminOrHigher,
} = require("../middleware/auth");

// Public user routes - require authentication
router.post("/", authenticatePublic, create);
router.get("/my-reports", authenticatePublic, listMine);
router.get("/my-reports/:id", authenticatePublic, getMine);

// Admin routes - require admin authentication
router.get("/", authenticateAdmin, requireAdminOrHigher, listAll);
router.get("/stats", authenticateAdmin, requireAdminOrHigher, stats);
router.get("/:id", authenticateAdmin, requireAdminOrHigher, getOne);
router.put("/:id", authenticateAdmin, requireAdminOrHigher, update);
router.delete("/:id", authenticateAdmin, requireAdminOrHigher, deleteReport);

module.exports = router;
