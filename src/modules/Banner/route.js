const express = require("express");
const router = express.Router();
const bannerController = require("./controller"); // Adjust the path as necessary
const handleS3Upload = require("../Middleware/s3UploadHandler");
const S3_FOLDER = "banner";
const FILE_FIELD_NAME = "images"; // Define the field name

// Route to add a new Banner with file upload middleware
router.post(
  "/banner",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  bannerController.addBanner
);
router.put(
  "/banner/:id",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  bannerController.updateBanner
);
router.put("/banner-active/:id", bannerController.makeBannerActive);
router.delete("/banner/:id", bannerController.deleteBanner);
router.get("/banner", bannerController.getAllBanner);
router.get("/all-active-banner", bannerController.getAllActiveBanner);
router.get("/banner/:id", bannerController.getBannerById);

module.exports = router;
