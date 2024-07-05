const express = require('express');
const router = express.Router();
const { createChatOrder, getChatOrdersByCustomer, updateChatOrderStatus, getChatOrdersByVendor, updateOrderAmountAndStatus } = require('./controller'); // Adjust the path as necessary

// POST route to create a new ChatOrder
router.post('/create-chat-order', createChatOrder);

// GET route to fetch all ChatOrders of a particular customer
router.get('/customer/:customerId/chat-orders', getChatOrdersByCustomer);


router.put('/chat-order/status/:orderId/vendor/', updateChatOrderStatus);

router.get('/chat-order/vendor/:vendorId', getChatOrdersByVendor);

router.put('/chat-order-status-amount', updateOrderAmountAndStatus);




module.exports = router;
