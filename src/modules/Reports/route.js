const express = require('express');
const router = express.Router();
const reportController = require('../Reports/controller'); 

// Create a new order

router.get('/get-sales/:vendorId', reportController.getTotalSales);
router.get('/monthly-sales/:vendorId', reportController.getMonthlySales);
router.get('/orders-counts/:vendorId', reportController.getOrderCounts);
router.get('/monthly-orders-counts/:vendorId', reportController.getMonthlyOrderCounts);


module.exports = router;
