const express = require("express");
const router = express.Router();
const productController = require("./controller"); // Adjust the path as necessary
const handleS3Upload = require("../Middleware/s3UploadHandler");

// Define dynamic fields for S3 upload
const getProductUploadFields = () => {
  const fields = [];

  // Product images (up to 10 images)
  for (let i = 0; i < 10; i++) {
    fields.push({ name: `productImage_${i}`, maxCount: 1 });
  }

  // Variation images (up to 50 variations, 5 images each)
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

// Route to add a new product with file upload middleware
router.post(
  "/products",
  handleS3Upload("products", getProductUploadFields()),
  productController.addProduct
);
router.put(
  "/products/:id",
  handleS3Upload("products", getProductUploadFields()),
  productController.updateProduct
);
router.delete("/products/:id", productController.deleteProduct);
router.get("/products/:vendorId", productController.getAllProductsVendor);
router.get("/get-all-products/", productController.getAllProducts);
router.get(
  "/products-low-quantity/:vendorId",
  productController.getProductsLowQuantity
);

router.get("/single-product/:id", productController.getProductById);

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
