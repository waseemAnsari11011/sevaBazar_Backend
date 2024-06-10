const express = require('express');
const router = express.Router();
const helpCenterController = require('./controller');
const authenticateToken = require('../Middleware/authMiddleware');
const authorizeAdmin = require('../Middleware/authorizeMiddleware');

// Route to create a new FAQ
router.post('/faqs', authenticateToken, authorizeAdmin, helpCenterController.createFAQ);

// Route to get all FAQs
router.get('/faqs',  helpCenterController.getFAQs);

// Route to get a single FAQ by ID
router.get('/faqs/:id', authenticateToken, authorizeAdmin, helpCenterController.getFAQById);

// Route to update an FAQ by ID
router.put('/faqs/:id', authenticateToken, authorizeAdmin, helpCenterController.updateFAQ);

// Route to delete an FAQ by ID
router.delete('/faqs/:id', authenticateToken, authorizeAdmin, helpCenterController.deleteFAQ);

module.exports = router;
