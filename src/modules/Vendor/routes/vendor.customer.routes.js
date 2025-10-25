const express = require("express");
const router = express.Router();
const vendorController = require("../controller");
const authenticateToken = require("../../Middleware/authMiddleware");

// =================================================================
// CUSTOMER VENDOR BROWSING ROUTES
// =================================================================

// Get all vendors (online + offline)
router.get("/", authenticateToken, vendorController.getAllVendors);

// Get all vendors with product discounts
router.get(
  "/with-discounts",
  authenticateToken,
  vendorController.getVendorsWithDiscounts
);

// Get vendors by category
router.get(
  "/by-category/:categoryId",
  authenticateToken,
  vendorController.getVendorsByCategory
);

// Search vendors (public or authenticated)
router.get("/search", vendorController.searchVendors);

// Search vendors within a specific category
router.get(
  "/search/:categoryId",
  authenticateToken,
  vendorController.searchVendorsByCategory
);

// Get a single vendor's public details
router.get("/:id/details", vendorController.getVendorDetails);

module.exports = router;
