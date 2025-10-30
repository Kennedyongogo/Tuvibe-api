const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const ctrl = require("../controllers/favouriteController");

router.get("/", authenticatePublic, ctrl.list);
router.post("/", authenticatePublic, ctrl.add);
router.delete("/:id", authenticatePublic, ctrl.remove);

module.exports = router;
