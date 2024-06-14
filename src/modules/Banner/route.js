const express = require('express');
const router = express.Router();
const bannerController = require('./controller'); // Adjust the path as necessary
const handleUpload = require('../Middleware/uploadHandler');

// Define the upload directory
const uploadDir = 'uploads/banner';


// Route to add a new Banner with file upload middleware
router.post('/banner', handleUpload(uploadDir), bannerController.addBanner);
router.put('/banner/:id', handleUpload(uploadDir), bannerController.updateBanner);
router.put('/banner-active/:id', bannerController.makeBannerActive);
router.delete('/banner/:id', bannerController.deleteBanner);
router.get('/banner', bannerController.getAllBanner);
router.get('/all-active-banner', bannerController.getAllActiveBanner);
router.get('/banner/:id', bannerController.getBannerById);

module.exports = router;
