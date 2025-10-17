const express = require("express");
const router = express.Router();
const { getSettings, updateSettings } = require("./controller");
const authenticateToken = require("../Middleware/authMiddleware");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");

// const { authorizeMiddleware } = require("../Middleware/authorizeMiddleware");

/**
 * @swagger
 * tags:
 * name: Settings
 * description: API for managing application-wide settings
 */

// Route to get the current settings
// Accessible by any authenticated user
router.get("/", getSettings);

// Route to update the settings
// Restricted to users with the 'superadmin' role
router.put("/", authenticateToken, authorizeAdmin, updateSettings);

module.exports = router;
