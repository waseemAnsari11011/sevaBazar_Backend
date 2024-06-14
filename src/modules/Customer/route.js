const express = require('express');
const router = express.Router();
const customerController = require('./controller');
const authenticateToken = require('../Middleware/authMiddleware');
const authorizeAdmin = require('../Middleware/authorizeMiddleware');
const handleUpload = require('../Middleware/uploadHandler');

// Define the upload directory
const uploadDir = 'uploads/customer';

// Route to create a new customer
router.post('/customers/signup', customerController.createCustomer);

// Route for customers login
router.post('/customers/login', customerController.customerLogin);

// Route for customers login
router.post('/customers/login/phone', customerController.customerLoginPhone);

// send otp test
router.post('/send-otp', customerController.sendOtp);

// Route to get a customer by ID
router.get('/customers/:id', customerController.getCustomerById);


// Route to delete a customer by ID
router.delete('/customers/:id', customerController.deleteCustomer);

//save address
router.post('/address/:id', customerController.saveAddressAndLocalities);

// Route to get all customers
router.get('/customers', authenticateToken, authorizeAdmin, customerController.getAllCustomers);

//Restrict customers
router.put('/customers/restrict/:id', authenticateToken, authorizeAdmin, customerController.restrictCustomer);

//UnRestrict customers
router.put('/customers/unrestrict/:id', authenticateToken, authorizeAdmin, customerController.unRestrictCustomer);

router.post('/check-restricted', customerController.checkIfUserIsRestricted);

// Route to update a customer by ID
router.put('/single-customer/:id',handleUpload(uploadDir), customerController.updateCustomer);

module.exports = router;
