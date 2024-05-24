const express = require('express');
const router = express.Router();
const customerController = require('./controller');

// Route to create a new customer
router.post('/customers', customerController.createCustomer);

// Route to get all customers
router.get('/customers', customerController.getAllCustomers);

// Route to get a customer by ID
router.get('/customers/:id', customerController.getCustomerById);

// Route to update a customer by ID
router.put('/customers/:id', customerController.updateCustomer);

// Route to delete a customer by ID
router.delete('/customers/:id', customerController.deleteCustomer);

module.exports = router;
