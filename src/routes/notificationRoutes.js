const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const { authenticateAdmin } = require("../middleware/auth");
const ctrl = require("../controllers/notificationController");

router.get("/", authenticatePublic, ctrl.listMine);
router.post("/:id/read", authenticatePublic, ctrl.markRead);

router.post("/admin", authenticateAdmin, ctrl.adminCreate);

module.exports = router;
