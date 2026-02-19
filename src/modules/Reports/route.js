const express = require('express');
const router = express.Router();
const reportController = require('../Reports/controller');
const handleS3Upload = require('../Middleware/s3UploadHandler');

// Create a new order

router.get('/get-sales/:vendorId', reportController.getTotalSales);
router.get('/monthly-sales/:vendorId', reportController.getMonthlySales);
router.get('/orders-counts/:vendorId', reportController.getOrderCounts);
router.get('/monthly-orders-counts/:vendorId', reportController.getMonthlyOrderCounts);
router.get('/all-vendors-earnings', reportController.getAllVendorsEarnings);
router.get('/vendor-earnings-details/:vendorId', reportController.getVendorEarningsDetails);
router.post(
    '/bulk-update-payment-status',
    handleS3Upload('payouts', 'billFile'),
    reportController.bulkUpdateVendorPaymentStatus
);
router.post('/update-order-payment-status', reportController.updateSingleOrderPaymentStatus);

// Driver Earnings Reports
router.get('/all-drivers-earnings', reportController.getAllDriversEarnings);
router.get('/driver-earnings-details/:driverId', reportController.getDriverEarningsDetails);
router.post('/bulk-update-driver-payment-status', reportController.bulkUpdateDriverPaymentStatus);


module.exports = router;
