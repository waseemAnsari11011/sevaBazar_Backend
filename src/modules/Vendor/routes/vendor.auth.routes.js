const express = require("express");
const router = express.Router();
const vendorController = require("../controller");
const handleS3Upload = require("../../Middleware/s3UploadHandler");

const S3_FOLDER = "vendor-documents";

// =================================================================
// VENDOR AUTHENTICATION ROUTES (No auth required)
// =================================================================

// Vendor Registration/Signup
router.post(
  "/signup",
  handleS3Upload(S3_FOLDER, [
    { name: "shopPhoto", maxCount: 5 },
    { name: "selfiePhoto", maxCount: 1 },
    { name: "aadharFrontDocument", maxCount: 1 },
    { name: "aadharBackDocument", maxCount: 1 },
    { name: "panCardDocument", maxCount: 1 },
    { name: "qrCode", maxCount: 1 },
    { name: "gstCertificate", maxCount: 1 },
    { name: "fssaiCertificate", maxCount: 1 },
  ]),
  vendorController.createVendor
);

// Vendor Login
router.post("/login", vendorController.vendorLogin);

// Forgot Password
router.post("/forgot-password", vendorController.forgotPassword);

// Reset Password
router.post("/reset-password/:token", vendorController.resetPassword);

module.exports = router;
