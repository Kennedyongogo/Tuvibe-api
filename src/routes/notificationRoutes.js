const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const { authenticateAdmin } = require("../middleware/auth");
const ctrl = require("../controllers/notificationController");

router.get("/", authenticatePublic, ctrl.listMine);
router.get("/stats", authenticatePublic, ctrl.getStats);
router.post("/:id/read", authenticatePublic, ctrl.markRead);
router.delete("/:id", authenticatePublic, ctrl.delete);

router.post("/admin", authenticateAdmin, ctrl.adminCreate);

module.exports = router;
