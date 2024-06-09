const express = require('express');
const router = express.Router();
const reportController = require('../Reports/controller'); 

// Create a new order

router.get('/get-sales', reportController.getTotalSales);
router.get('/monthly-sales', reportController.getMonthlySales);
router.get('/orders-counts', reportController.getOrderCounts);
router.get('/monthly-orders-counts', reportController.getMonthlyOrderCounts);


module.exports = router;
