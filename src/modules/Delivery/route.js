const express = require('express');
const router = express.Router();
const deliveryController = require('./controller');
const authenticateToken = require('../Middleware/authMiddleware');
const authorizeAdmin = require('../Middleware/authorizeMiddleware');
const handleUpload = require('../Middleware/uploadHandler');

// Define the upload directory
const uploadDir = 'uploads/delivery';

// Route for delivery login
router.post('/delivery/login/phone', deliveryController.deliveryLoginPhone);

// Route to get a delivery by ID
router.get('/delivery/:id', deliveryController.getDeliveryById);

// Route to update a delivery by ID
router.put('/single-delivery/:id',handleUpload(uploadDir), deliveryController.updateDelivery);

router.post('/delivery/check-restricted', deliveryController.checkIfUserIsRestricted);


router.put('/delivery/update-fcm/:id', deliveryController.updateFcm);


module.exports = router;
