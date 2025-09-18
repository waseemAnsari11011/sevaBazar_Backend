const express = require("express");
const router = express.Router();
const categoryController = require("./controller");
const handleS3Upload = require("../Middleware/s3UploadHandler");

const S3_FOLDER = "category";
const FILE_FIELD_NAME = "images"; // Define the field name

router.post(
  "/category",
  // ✅ FIX: Explicitly tell middleware which field to process
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  categoryController.addCategory
);

router.put(
  "/category/:id",
  // ✅ FIX: Explicitly tell middleware which field to process
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  categoryController.updateCategory
);

router.delete("/category/:id", categoryController.deleteCategory);
router.get("/category", categoryController.getAllCategory);
router.get("/category/:id", categoryController.getCategoryById);

module.exports = router;
