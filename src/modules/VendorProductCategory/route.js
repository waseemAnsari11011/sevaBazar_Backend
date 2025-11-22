const express = require("express");
const router = express.Router();
const controller = require("./controller");
const handleS3Upload = require("../Middleware/s3UploadHandler");

const S3_FOLDER = "vendor_product_category";
const FILE_FIELD_NAME = "images";

router.post(
  "/vendor-product-category",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  controller.addCategory
);

router.get(
  "/vendor-product-category/vendor/:vendorId",
  controller.getCategoriesByVendor
);

router.put(
  "/vendor-product-category/:id",
  handleS3Upload(S3_FOLDER, FILE_FIELD_NAME),
  controller.updateCategory
);

router.delete("/vendor-product-category/:id", controller.deleteCategory);

module.exports = router;
