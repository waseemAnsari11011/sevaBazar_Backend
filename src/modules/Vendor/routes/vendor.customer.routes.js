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

// Get all vendors, grouped by their category
router.get(
  "/all-by-category",
  authenticateToken,
  vendorController.getAllVendorsGroupedByCategory // <-- ADD THIS NEW ROUTE
);

// Get vendors by category
router.get(
  "/by-category/:categoryId",
  authenticateToken,
  vendorController.getVendorsByCategory
);

// Search vendors within a specific category
router.get(
  "/search/:categoryId",
  authenticateToken,
  vendorController.searchVendorsByCategory
);

// Search vendors (public or authenticated)
router.get("/search", authenticateToken, vendorController.searchVendors);

// Get a single vendor's public details
router.get("/:id/details", vendorController.getVendorDetails);

module.exports = router;
