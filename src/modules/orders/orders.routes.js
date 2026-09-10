const express = require("express");
const controller = require("./orders.controller");

const router = express.Router();

router.get("/financial-summary", controller.summary);
router.get("/", controller.list);
router.get("/:uuid/items", controller.items);
router.get("/:uuid", controller.detail);

module.exports = router;