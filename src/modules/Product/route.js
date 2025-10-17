const express = require("express");
const router = express.Router();
const productController = require("./controller");
const handleS3Upload = require("../Middleware/s3UploadHandler");

// Middleware for creating a product with many variations
const createProductUploadFields = () => {
  const fields = [];
  for (let variationIndex = 0; variationIndex < 50; variationIndex++) {
    for (let imageIndex = 0; imageIndex < 5; imageIndex++) {
      fields.push({
        name: `variationImage_${variationIndex}_${imageIndex}`,
        maxCount: 1,
      });
    }
  }
  return fields;
};

// Middleware for updating a SINGLE variation's images
const updateVariationUploadFields = [
  { name: "newImages", maxCount: 5 }, // Simple field name for new images
];

// --- ROUTES ---

// Create a new product
router.post(
  "/products",
  handleS3Upload("products", createProductUploadFields()),
  productController.addProduct
);

// Update core product details (no file upload)
router.put(
  "/products/:id",
  express.json(),
  productController.updateProductDetails
);

// ADD NEW VARIATION to an existing product
router.post(
  "/products/:id/variations",
  handleS3Upload("products", updateVariationUploadFields),
  productController.addVariation
);

// Update a specific, existing variation
router.put(
  "/products/:id/variations/:variationId",
  // FIXED: Use the correct, simpler middleware for this route
  handleS3Upload("products", updateVariationUploadFields),
  productController.updateVariation
);
router.get("/products/:vendorId", productController.getAllProductsVendor);
router.get("/single-product/:id", productController.getProductById);

router.delete("/products/:id", productController.deleteProduct);
router.get("/get-all-products/", productController.getAllProducts);
router.get(
  "/products-low-quantity/:vendorId",
  productController.getProductsLowQuantity
);

router.get(
  "/categories/:id/products",
  productController.getProductsByCategoryId
);
router.get("/products/:id/similar", productController.getSimilarProducts);
router.get(
  "/recentlyAddedProducts",
  productController.getRecentlyAddedProducts
);
router.get("/onDiscountProducts", productController.getDiscountedProducts);
router.get("/searchProducts", productController.fuzzySearchProducts);
router.put("/update-arrival-duration", productController.updateArrivalDuration);
router.put(
  "/products/:productId/variations/:variationId",
  productController.updateVariationQuantity
);
router.patch(
  "/products/:id/toggle-visibility",
  productController.toggleVisibility
);
router.patch(
  "/products/add-is-visible-field",
  productController.addIsVisibleField
);
//get all category products
router.get("/allCategoryProducts", productController.getallCategoryProducts);
router.post("/makeActive", productController.makeActive);
router.post("/makeInActive", productController.makeInActive);

router.get("/search", productController.searchVendorProducts);

// Add the new route to fetch products for a specific vendor in a public context (customer view)
router.get("/products/vendor/:vendorId", productController.getProductsByVendor);

module.exports = router;
