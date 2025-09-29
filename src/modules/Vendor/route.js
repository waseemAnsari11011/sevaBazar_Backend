const express = require("express");
const router = express.Router();
const vendorController = require("./controller");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");
const authenticateToken = require("../Middleware/authMiddleware");
const handleS3Upload = require("../Middleware/s3UploadHandler");

// Define the S3 folder name for vendor documents
const S3_FOLDER = "vendor-documents";
//
// Route to create a new vendor
router.post(
  "/signup",
  handleS3Upload(S3_FOLDER, [
    { name: "shopPhoto", maxCount: 5 }, // Allow up to 5 shop photos
    { name: "selfiePhoto", maxCount: 1 },
    { name: "aadharFrontDocument", maxCount: 1 }, // Corrected field name
    { name: "aadharBackDocument", maxCount: 1 }, // Corrected field name
    { name: "panCardDocument", maxCount: 1 },
    { name: "qrCode", maxCount: 1 },
  ]),
  vendorController.createVendor
);

// Route to get all vendors
router.get(
  "/",
  authenticateToken,
  authorizeAdmin,
  vendorController.getAllVendors
);

router.get("/:vendorId", vendorController.getVendorById); // New route to get vendor by ID

// Route to update a vendor by ID
router.put("/:id", vendorController.updateVendor);

// Restrict Vendor
router.put(
  "/restrict/:id",
  authenticateToken,
  authorizeAdmin,
  vendorController.restrictVendor
);

// UnRestrict Vendor
router.put(
  "/unrestrict/:id",
  authenticateToken,
  authorizeAdmin,
  vendorController.unRestrictVendor
);

// Route to delete a vendor by ID
router.delete("/:id", vendorController.deleteVendor);

// Route for vendor login
router.post("/login", vendorController.vendorLogin);

// Get all vendors (online + offline)
router.get("/all/vendor", vendorController.getAllVendors);

// Get nearby vendors (based on location)
router.get("/nearby/vendor", vendorController.getNearbyVendors);

// Toggle vendor status (on/off)
router.patch("/toggle-status/:id", vendorController.toggleVendorStatus);

// Get vendors by category
router.get("/by-category/:categoryId", vendorController.getVendorsByCategory);

// Search vendors
router.get("/search", vendorController.searchVendors);

// Vendor details
router.get("/:id/details", vendorController.getVendorDetails);

router.put("/address/:vendorId", vendorController.updateVendorAddress); // New route for updating address

// Route to get a vendor by ID (for admin)
router.get(
  "/:vendorId",
  authenticateToken,
  authorizeAdmin,
  vendorController.getVendorById
);

// Forgot Password
router.post("/forgot-password", vendorController.forgotPassword);

// Reset Password
router.post("/reset-password/:token", vendorController.resetPassword);

module.exports = router;
