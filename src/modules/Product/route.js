const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const productController = require('./controller'); // Adjust the path as necessary

// Define the upload directory
const uploadDir = 'uploads/products';

// Create the uploads directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Use the uploads directory
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});

const upload = multer({ storage: storage }).array('images', 10); // Allow up to 10 images

// Route to add a new product with file upload middleware
router.post('/products', upload, productController.addProduct);
router.put('/products/:id',upload, productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);
router.get('/products', productController.getAllProducts);
router.get('/products-low-quantity/:vendorId', productController.getProductsLowQuantity);

router.get('/products/:id', productController.getProductById);

router.get('/categories/:id/products', productController.getProductsByCategoryId);
router.get('/products/:id/similar', productController.getSimilarProducts);
router.get('/recentlyAddedProducts', productController.getRecentlyAddedProducts);
router.get('/onDiscountProducts', productController.getDiscountedProducts);
router.get('/searchProducts', productController.fuzzySearchProducts);

module.exports = router;
