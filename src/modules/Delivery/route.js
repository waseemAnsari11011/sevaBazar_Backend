const express = require("express");
const router = express.Router();
const deliveryController = require("./controller");
const multer = require("multer");
const path = require("path");

// Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

router.post("/delivery/login", deliveryController.deliveryLoginPhone);
router.get("/delivery/:id", deliveryController.getDeliveryById);
router.put("/delivery/:id", upload.array("image", 1), deliveryController.updateDelivery);
router.post("/delivery/check-restricted", deliveryController.checkIfUserIsRestricted);
router.put("/delivery/fcm/:id", deliveryController.updateFcm);

module.exports = router;
