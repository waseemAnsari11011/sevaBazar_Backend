const express = require("express");
const router = express.Router();
const vendorController = require("../controller");
const authenticateToken = require("../../Middleware/authMiddleware");

// =================================================================
// VENDOR SELF-MANAGEMENT ROUTES
// Routes for vendors to manage their own account
// =================================================================

// Apply authentication to all routes
router.use(authenticateToken);

// Toggle vendor status (on/off) by the vendor themselves
router.patch("/toggle-status/:id", vendorController.toggleVendorStatus);

// Route for a vendor to update their own profile
router.put("/profile", authenticateToken, vendorController.updateVendorProfile);

// Update own vendor address
router.put("/address/:vendorId", vendorController.updateVendorAddress);

// Save device token for push notifications
router.post("/save-device-token", vendorController.saveDeviceToken);

// Delete own vendor account (optional - might want admin-only)
// router.delete("/:id", vendorController.deleteVendor);

module.exports = router;
