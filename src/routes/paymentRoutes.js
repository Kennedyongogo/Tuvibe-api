const express = require("express");
const router = express.Router();
const { authenticatePublic } = require("../middleware/publicAuth");
const ctrl = require("../controllers/paymentController");

router.get("/", authenticatePublic, ctrl.list);
router.post("/", authenticatePublic, ctrl.create);

module.exports = router;
