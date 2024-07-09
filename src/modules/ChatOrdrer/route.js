const express = require('express');
const router = express.Router();
const {getChatOrder, updateChatOrder, markChatOrderViewed, getNewChatOrdersCountByVendor, updateChatPaymentStatusManually, createChatOrder, getChatOrdersByCustomer, updateChatOrderStatus, getChatOrdersByVendor, updateOrderAmountAndStatus } = require('./controller'); // Adjust the path as necessary

// POST route to create a new ChatOrder
router.post('/create-chat-order', createChatOrder);

// PUT route to update an existing ChatOrder
router.put('/chat/updateChatOrder', updateChatOrder);


// GET route to fetch a single ChatOrder
router.get('/chat-order/:orderId', getChatOrder);

// GET route to fetch all ChatOrders of a particular customer
router.get('/customer/:customerId/chat-orders', getChatOrdersByCustomer);


router.put('/chat-order/status/:orderId/vendor/', updateChatOrderStatus);

router.get('/chat-order/vendor/:vendorId', getChatOrdersByVendor);

router.put('/chat-order-status-amount', updateOrderAmountAndStatus);

router.post('/chat-verify-payment', updateChatPaymentStatusManually);

router.get('/new-chat-order/vendor/:vendorId', getNewChatOrdersCountByVendor);
router.get('/mark-viewed/chat-orders/:vendorId', markChatOrderViewed);

module.exports = router;
