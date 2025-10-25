const express = require("express");
const router = express.Router();
const vendorController = require("../controller");
const authorizeAdmin = require("../../Middleware/authorizeMiddleware");
const authenticateToken = require("../../Middleware/authMiddleware");

// =================================================================
// ADMIN VENDOR MANAGEMENT ROUTES
// All routes here require authentication + admin authorization
// =================================================================

// Apply middleware to all admin routes
router.use(authenticateToken, authorizeAdmin);

// Get all vendors for Admin panel
router.get("/", vendorController.getAllVendorsAdmin);

// Get a specific vendor by ID
router.get("/:vendorId", vendorController.getVendorById);

// Restrict Vendor
router.put("/restrict/:id", vendorController.restrictVendor);

// UnRestrict Vendor
router.put("/unrestrict/:id", vendorController.unRestrictVendor);

// Admin login as vendor
router.post("/login-as-vendor/:vendorId", vendorController.adminLoginAsVendor);

// Update vendor (admin can update any vendor)
router.put("/:id", vendorController.updateVendor);

// Delete vendor (admin only)
router.delete("/:id", vendorController.deleteVendor);

module.exports = router;
