const express = require("express");
const router = express.Router();
const driverController = require("./controller");
const authenticateToken = require("../Middleware/authMiddleware");
const authorizeAdmin = require("../Middleware/authorizeMiddleware");
const createS3Upload = require("../Middleware/s3UploadMiddleware");

// Admin only route to create driver
router.post(
    "/create-driver",
    authenticateToken,
    authorizeAdmin,
    createS3Upload("driver-documents", "documents"),
    driverController.createDriver
);

// Admin only route to get all drivers
router.get("/drivers", authenticateToken, authorizeAdmin, driverController.getAllDrivers);

// Public route for driver registration with document upload
router.post(
    "/driver/register",
    createS3Upload("driver-documents", "documents"),
    driverController.createDriver
);

// Public route for driver login
router.post("/driver/login", driverController.driverLogin);

// Admin only route to update driver status (Approve/Suspend)
router.patch("/driver/:id/status", authenticateToken, authorizeAdmin, driverController.updateDriverStatus);

// Driver routes for real-time tracking
router.patch("/driver/status", authenticateToken, driverController.updateOnlineStatus);
router.patch("/driver/location", authenticateToken, driverController.updateLocation);

// Test route for finding nearest available drivers (Public for simulation/testing)
router.post("/drivers/nearest", driverController.findNearestDrivers);

// Public route for calculating delivery fee (Driver Earnings/Customer Delivery Charge)
router.post("/calculate-delivery", driverController.calculateDriverFee);

// Route for verifying pickup with OTP
router.post("/driver/verify-pickup", driverController.verifyPickup);

// Route for initiating delivery completion (sending OTP)
router.post("/driver/initiate-delivery-completion", driverController.initiateDeliveryCompletion);

// Route for completing delivery
router.post("/driver/complete-delivery", driverController.completeDelivery);

// Route for getting driver's orders
router.get("/driver/orders/:driverId", driverController.getDriverOrders);

// Route for getting driver's active order
router.get("/driver/active-order/:driverId", driverController.getActiveOrder);

// Route for getting wallet balance
router.get("/driver/wallet/:driverId", driverController.getWalletBalance);

// Route for getting completed orders history
router.get("/driver/completed-orders/:driverId", driverController.getCompletedOrders);

module.exports = router;
