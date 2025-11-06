const express = require("express");
const router = express.Router();
const vendorController = require("../controller");
const authorizeAdmin = require("../../Middleware/authorizeMiddleware");
const authenticateToken = require("../../Middleware/authMiddleware");
const handleS3Upload = require("../../Middleware/s3UploadHandler");

// Define the fields configuration for S3 upload
const vendorDocumentFields = [
  { name: "shopPhoto", maxCount: 10 }, // Multiple shop photos
  { name: "selfiePhoto", maxCount: 1 }, // Single selfie
  { name: "aadharFrontDocument", maxCount: 1 }, // Aadhar front
  { name: "aadharBackDocument", maxCount: 1 }, // Aadhar back
  { name: "panCardDocument", maxCount: 1 }, // PAN card
  { name: "gstCertificate", maxCount: 1 }, // GST certificate
  { name: "fssaiCertificate", maxCount: 1 }, // FSSAI certificate
  { name: "qrCode", maxCount: 1 }, // UPI QR code
];

// =================================================================
// ADMIN VENDOR MANAGEMENT ROUTES
// All routes here require authentication + admin authorization
// =================================================================

// Apply middleware to all admin routes
router.use(authenticateToken, authorizeAdmin);

router.put(
  "/:id",
  ...handleS3Upload("vendor-documents", vendorDocumentFields),
  vendorController.updateVendor
);

// Get all vendors for Admin panel
router.get("/", vendorController.getAllVendorsAdmin);

// Get a specific vendor by ID
router.get("/:vendorId", vendorController.getVendorById);

// Delete vendor (admin only)
router.delete("/:id", vendorController.deleteVendor);

// Restrict Vendor
router.put("/restrict/:id", vendorController.restrictVendor);

// UnRestrict Vendor
router.put("/unrestrict/:id", vendorController.unRestrictVendor);

// Admin login as vendor
router.post("/login-as-vendor/:vendorId", vendorController.adminLoginAsVendor);

module.exports = router;
