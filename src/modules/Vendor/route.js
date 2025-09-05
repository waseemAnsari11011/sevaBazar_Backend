const express = require("express");
const router = express.Router();
const vendorController = require("./controller");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");
const authenticateToken = require("../Middleware/authMiddleware");

// Route to create a new vendor
router.post("/signup", vendorController.createVendor);

// Route to get all vendors
router.get(
  "/",
  authenticateToken,
  authorizeAdmin,
  vendorController.getAllVendors
);

// Route to get a vendor by ID
router.get("/:id", vendorController.getVendorById);

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

module.exports = router;
