const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/marketItemController");
const { authenticateAdmin } = require("../middleware/auth");

router.get("/", ctrl.list);
router.post("/", authenticateAdmin, ctrl.create);
router.put("/:id", authenticateAdmin, ctrl.update);
router.delete("/:id", authenticateAdmin, ctrl.remove);

module.exports = router;
