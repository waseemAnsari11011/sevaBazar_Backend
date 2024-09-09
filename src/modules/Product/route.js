const express = require('express');
const router = express.Router();
const upload = require('../Middleware/uploadHandler'); // Adjust the path as necessary
const productController = require('./controller'); // Adjust the path as necessary

// Route to add a new product with file upload middleware
router.post('/products', upload('uploads/products'), productController.addProduct);
router.put('/products/:id', upload('uploads/products'), productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);
router.get('/products/:vendorId', productController.getAllProductsVendor);
router.get('/get-all-products/', productController.getAllProducts);
router.get('/products-low-quantity/:vendorId', productController.getProductsLowQuantity);

router.get('/single-product/:id', productController.getProductById);

router.get('/categories/:id/products', productController.getProductsByCategoryId);
router.get('/products/:id/similar', productController.getSimilarProducts);
router.get('/recentlyAddedProducts', productController.getRecentlyAddedProducts);
router.get('/onDiscountProducts', productController.getDiscountedProducts);
router.get('/searchProducts', productController.fuzzySearchProducts);
router.put('/update-arrival-duration', productController.updateArrivalDuration);
router.put('/products/:productId/variations/:variationId', productController.updateVariationQuantity);
router.patch('/products/:id/toggle-visibility', productController.toggleVisibility);
router.patch('/products/add-is-visible-field', productController.addIsVisibleField);
//get all category products
router.get('/allCategoryProducts', productController.getallCategoryProducts);
module.exports = router;
