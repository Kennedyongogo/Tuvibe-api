const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const ctrl = require("../controllers/lookingForPostController");

router.get("/mine", authenticatePublic, ctrl.listMine);
router.post("/", authenticatePublic, ctrl.create);
router.put("/:id", authenticatePublic, ctrl.update);
router.delete("/:id", authenticatePublic, ctrl.remove);

module.exports = router;
