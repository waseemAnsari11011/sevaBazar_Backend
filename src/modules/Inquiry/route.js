const express = require('express');
const router = express.Router();
const inquiryController = require('./controller');
const authenticateToken = require('../Middleware/authMiddleware');
const authorizeAdmin = require('../Middleware/authorizeMiddleware');

// Routes for user
router.post('/inquiries', inquiryController.createInquiry);
router.get('/inquiries/:id/user', inquiryController.getUserInquiries);

// Routes for admin
router.get('/inquiries', authenticateToken, authorizeAdmin, inquiryController.getAllInquiries);
router.put('/inquiries/:id/respond', authenticateToken, authorizeAdmin, inquiryController.respondToInquiry);

module.exports = router;
