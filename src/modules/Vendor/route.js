const express = require("express");
const router = express.Router();
const vendorController = require("./controller");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");
const authenticateToken = require("../Middleware/authMiddleware");
const handleS3Upload = require("../Middleware/s3UploadHandler");

// Define the S3 folder name for vendor documents
const S3_FOLDER = "vendor-documents";

// =================================================================
// VENDOR AUTHENTICATION & REGISTRATION ROUTES
// =================================================================

// Route to create a new vendor (signup)
router.post(
  "/signup",
  handleS3Upload(S3_FOLDER, [
    { name: "shopPhoto", maxCount: 5 },
    { name: "selfiePhoto", maxCount: 1 },
    { name: "aadharFrontDocument", maxCount: 1 },
    { name: "aadharBackDocument", maxCount: 1 },
    { name: "panCardDocument", maxCount: 1 },
    { name: "qrCode", maxCount: 1 },
  ]),
  vendorController.createVendor
);

// Route for vendor login
router.post("/login", vendorController.vendorLogin);

// Forgot Password
router.post("/forgot-password", vendorController.forgotPassword);

// Reset Password
router.post("/reset-password/:token", vendorController.resetPassword);

// =================================================================
// PUBLIC VENDOR ROUTES (No Auth Required)
// =================================================================

// Get all vendors (online + offline) - Customer app
router.get("/all/vendor", authenticateToken, vendorController.getAllVendors);
// Get all vendors with product discounts, sorted by highest discount
router.get(
  "/all/vendor/with-discounts",
  authenticateToken,
  vendorController.getVendorsWithDiscounts
);

// Get nearby vendors (based on location)
router.get("/nearby/vendor", vendorController.getNearbyVendors);

// Get vendors by category
router.get(
  "/by-category/:categoryId",
  authenticateToken,
  vendorController.getVendorsByCategory
);

// Search vendors
router.get("/search", vendorController.searchVendors);

// Search vendors within a specific category
router.get("/search/:categoryId", vendorController.searchVendorsByCategory);

// Get a single vendor's public details
// NOTE: This must be one of the LAST GET routes to avoid conflict
router.get("/:id/details", vendorController.getVendorDetails);

// =================================================================
// ADMIN-ONLY VENDOR ROUTES (Auth + Admin Role Required)
// =================================================================

// Route to get all vendors for Admin
router.get(
  "/",
  authenticateToken,
  authorizeAdmin,
  vendorController.getAllVendors
);

// Route to get all vendors for Admin
router.get(
  "/",
  authenticateToken,
  authorizeAdmin,
  vendorController.getAllVendors
);

// Route to get a specific vendor by ID for Admin
router.get(
  "/:vendorId", // Using vendorId to avoid conflict with other /:id routes
  authenticateToken,
  authorizeAdmin,
  vendorController.getVendorById
);

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
  vendorController.unRestrictVendor // Corrected typo here
);

// Route for admin to login as a vendor
router.post(
  "/admin-login-as-vendor/:vendorId",
  authenticateToken,
  authorizeAdmin,
  vendorController.adminLoginAsVendor
);

// =================================================================
// VENDOR-SPECIFIC ROUTES (Auth Required)
// =================================================================

// Toggle vendor status (on/off) by the vendor
router.patch("/toggle-status/:id", vendorController.toggleVendorStatus);

// Update a vendor by ID
router.put("/:id", vendorController.updateVendor);

// Update a vendor's address
router.put("/address/:vendorId", vendorController.updateVendorAddress);

// Delete a vendor by ID
router.delete("/:id", vendorController.deleteVendor);

module.exports = router;
