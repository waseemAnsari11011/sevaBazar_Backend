// src/modules/Category/route.js
const express = require("express");
const router = express.Router();
const categoryController = require("./controller");
const handleS3Upload = require("../Middleware/s3UploadHandler"); // Updated import
const authenticateToken = require("../Middleware/authMiddleware");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");

// Define the S3 folder name for categories
const S3_FOLDER = "category";

// Route to add a new Category with S3 file upload middleware
router.post(
  "/category",
  handleS3Upload(S3_FOLDER),
  categoryController.addCategory
);

router.put(
  "/category/:id",
  handleS3Upload(S3_FOLDER),
  categoryController.updateCategory
);
router.delete("/category/:id", categoryController.deleteCategory);
router.get("/category", categoryController.getAllCategory);
router.get("/category/:id", categoryController.getCategoryById);

module.exports = router;
