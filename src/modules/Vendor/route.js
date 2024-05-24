const express = require('express');
const router = express.Router();
const vendorController = require('./controller');

// Route to create a new vendor
router.post('/vendors', vendorController.createVendor);

// Route to get all vendors
router.get('/vendors', vendorController.getAllVendors);

// Route to get a vendor by ID
router.get('/vendors/:id', vendorController.getVendorById);

// Route to update a vendor by ID
router.put('/vendors/:id', vendorController.updateVendor);

// Route to delete a vendor by ID
router.delete('/vendors/:id', vendorController.deleteVendor);

// Route for vendor login
router.post('/vendors/login', vendorController.vendorLogin);

module.exports = router;
