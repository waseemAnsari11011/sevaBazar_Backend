const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const categoryController = require('./controller'); // Adjust the path as necessary
const handleUpload = require('../Middleware/uploadHandler');

// Define the upload directory
const uploadDir = 'uploads/category';


// Route to add a new Category with file upload middleware
router.post('/category', handleUpload(uploadDir), categoryController.addCategory);

router.put('/category/:id',handleUpload(uploadDir), categoryController.updateCategory);
router.delete('/category/:id', categoryController.deleteCategory);
router.get('/category', categoryController.getAllCategory);
router.get('/category/:id', categoryController.getCategoryById);

module.exports = router;
