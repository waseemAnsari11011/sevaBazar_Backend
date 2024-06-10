const express = require('express');
const router = express.Router();
const contactController = require('./controller');
const authenticateToken = require('../Middleware/authMiddleware');
const authorizeAdmin = require('../Middleware/authorizeMiddleware');

// Routes for user
router.post('/contact',authenticateToken,authorizeAdmin, contactController.createContact);
router.get('/get-contact', contactController.getContact);

module.exports = router;
