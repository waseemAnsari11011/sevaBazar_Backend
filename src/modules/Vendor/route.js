const express = require('express');
const router = express.Router();
const vendorController = require('./controller');
const authorizeAdmin = require('../Middleware/authorizeMiddleware');
const authenticateToken = require('../Middleware/authMiddleware');

// Route to create a new vendor
router.post('/vendors/signup', vendorController.createVendor);

// Route to get all vendors
router.get('/vendors', authenticateToken, authorizeAdmin, vendorController.getAllVendors);

// Route to get a vendor by ID
router.get('/vendors/:id', vendorController.getVendorById);

// Route to update a vendor by ID
router.put('/vendors/:id', vendorController.updateVendor);

//Restrict Vendor
router.put('/vendors/restrict/:id', authenticateToken, authorizeAdmin, vendorController.restrictVendor);

//UnRestrict Vendor
router.put('/vendors/unrestrict/:id', authenticateToken, authorizeAdmin, vendorController.unRestrictVendor);


// Route to delete a vendor by ID
router.delete('/vendors/:id', vendorController.deleteVendor);

// Route for vendor login
router.post('/vendors/login', vendorController.vendorLogin);

module.exports = router;
