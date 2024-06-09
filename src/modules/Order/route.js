const express = require('express');
const router = express.Router();
const orderController = require('../Order/controller');  // Adjust the path according to your project structure

// Create a new order
router.post('/order', orderController.createOrder);
router.post('/razorpay', orderController.createOrderRazorpay);
router.post('/razorpay-verify-payment', orderController.updatePaymentStatus);
router.post('/manually-verify-payment', orderController.updatePaymentStatusManually);

router.get('/order/vendor/:vendorId', orderController.getOrdersByVendor);
router.get('/order/recent-order/:vendorId', orderController.getRecentOrdersByVendor);

router.put('/order/status/:orderId/vendor/:vendorId', orderController.updateOrderStatus);
// router.get('/orders/customer/:customerId', orderController.getOrdersByCustomerAndStatus);
// Route to get all orders by customer ID
router.get('/orders/customer/:customerId', orderController.getOrdersByCustomerId);


module.exports = router;
