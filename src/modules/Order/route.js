const express = require('express');
const router = express.Router();
const orderController = require('../Order/controller');  // Adjust the path according to your project structure

// Create a new order
router.post('/order', orderController.createOrder);
router.post('/razorpay', orderController.createOrderRazorpay);
router.post('/razorpay-verify-payment', orderController.updatePaymentStatus);
router.post('/manually-verify-payment', orderController.updatePaymentStatusManually);

router.post('/seed-test-order', orderController.seedTestOrder);
router.get('/order/vendor/:vendorId', orderController.getOrdersByVendor);
router.get('/order/:orderId/vendor/:vendorId', orderController.getOrderDetailsByVendor);
router.get('/new-order/vendor/:vendorId', orderController.getNewOrdersCountByVendor);
router.get('/order/recent-order/:vendorId', orderController.getRecentOrdersByVendor);

router.put('/order/status/:orderId/vendor/:vendorId', orderController.updateOrderStatus);
// router.get('/orders/customer/:customerId', orderController.getOrdersByCustomerAndStatus);
// Route to get all orders by customer ID
router.get('/orders/customer/:customerId', orderController.getOrdersByCustomerId);
router.get('/order-history/:customerId', orderController.getOrdersHistoryByCustomerId);
router.get('/mark-viewed/orders/:vendorId', orderController.markOrderViewed);
router.get('/delivery/unaccepted-orders', orderController.getUnacceptedOrders);
router.put('/delivery/order-offer-response/:deliveryManId', orderController.handleOrderOfferResponse);



// ... (other routes)
router.get('/order/invoice/:orderId', orderController.getOrderInvoice);

module.exports = router;
