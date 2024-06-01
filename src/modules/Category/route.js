const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const categoryController = require('./controller'); // Adjust the path as necessary

// Define the upload directory
const uploadDir = 'uploads/category';

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

// Route to add a new Category with file upload middleware
router.post('/category', upload, categoryController.addCategory);

router.put('/category/:id',upload, categoryController.updateCategory);
router.delete('/category/:id', categoryController.deleteCategory);
router.get('/category', categoryController.getAllCategory);
router.get('/category/:id', categoryController.getCategoryById);

module.exports = router;
