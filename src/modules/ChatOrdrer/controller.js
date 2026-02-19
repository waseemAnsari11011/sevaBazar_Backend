const ChatOrder = require('./model'); // Adjust the path as necessary
const Customer = require('../Customer/model'); // Assuming you have a Customer model
const Vendor = require('../Vendor/model'); // Assuming you have a Customer model
const mongoose = require('mongoose');
const Settings = require('../Settings/model');
const emailService = require('../utils/emailService');
const { sendPushNotification } = require('../utils/pushNotificationUtil');

const { calculateDistance, calculateDeliveryFee } = require('../Driver/pricingUtil');

// Function to create a new ChatOrder
const createChatOrder = async (req, res) => {

    try {
        const { orderMessage, customer, name, shippingAddress, paymentStatus } = req.body;
        // Validate required fields
        if (!orderMessage || !customer || !shippingAddress) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Verify that the customer exists
        const customerExists = await Customer.findById(customer);
        if (!customerExists) {
            return res.status(404).json({ message: 'Customer not found' });
        }


        // Calculate Delivery Charge
        let vendorId = req.body.vendorId;

        // If no vendorId is provided, assign the first admin vendor as default
        if (!vendorId) {
            const adminVendor = await Vendor.findOne({ role: 'admin' });
            if (adminVendor) {
                vendorId = adminVendor._id;
            }
        }

        const vendorDetails = await Vendor.findById(vendorId);

        let deliveryCharge = 0;
        let distance = 0;

        if (vendorDetails && vendorDetails.location && vendorDetails.location.coordinates && shippingAddress.latitude && shippingAddress.longitude) {
            const vendorLat = vendorDetails.location.coordinates[1];
            const vendorLon = vendorDetails.location.coordinates[0];
            distance = calculateDistance(vendorLat, vendorLon, shippingAddress.latitude, shippingAddress.longitude);
            distance = parseFloat(distance.toFixed(2));

            // Fetch settings for delivery charge configuration
            const settings = await Settings.findOne();

            // Use unified pricing logic ✅
            const feeInfo = calculateDeliveryFee(distance, settings);
            deliveryCharge = parseFloat(feeInfo.amount.toFixed(2));
            var deliveryChargeDescription = feeInfo.description;
        }

        const SHIPPING_FEE = 9;

        // Create a new chat order
        const newChatOrder = new ChatOrder({

            orderMessage,
            customer,
            name,
            shippingAddress,
            paymentStatus,
            vendor: vendorId, // Assign the vendor (either from request or default admin)
            is_new: true,
            deliveryCharge,
            deliveryChargeDescription,
            distance,
            shippingFee: SHIPPING_FEE
        });

        // Save the order to the database
        const savedOrder = await newChatOrder.save();


        // const vendorDetails = await Vendor.findById(savedOrder.vendor)
        const customerDetails = await Customer.findById(savedOrder.customer)

        await emailService.sendNewChatOrderNotificationEmail(vendorDetails.email, savedOrder, customerDetails);


        return res.status(201).json({ message: 'ChatOrder created successfully', order: savedOrder });
    } catch (error) {
        console.error('Error creating chat order:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const updateChatOrder = async (req, res) => {
    try {
        const { orderId, products } = req.body;

        // Validate required fields
        if (!orderId || !products || !Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Find the order by orderId or numeric orderId
        const query = mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId: orderId };
        const order = await ChatOrder.findOne(query);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Update the products and calculate the total amount
        order.products = products;
        order.orderStatus = 'Pending';
        order.is_new = false;
        order.totalAmount = products.reduce((total, product) => {
            // Calculate the subtotal for each product considering discounts
            const subtotal = product.price * product.quantity * (1 - product.discount / 100);
            // Add the subtotal to the running total
            return total + subtotal;
        }, 0);

        // Round the totalAmount to two decimal places
        order.totalAmount = parseFloat(order.totalAmount.toFixed(2));
        // Save the updated order
        const updatedOrder = await order.save();

        if (products) {
            // Extract customer ID from the order
            const customerId = order.customer._id;
            // Retrieve the customer from database to get FCM token
            const customer = await Customer.findById(customerId);
            if (!customer) {
                return res.status(404).json({ error: 'Customer not found' });
            }
            const fcmtoken = customer.fcmDeviceToken; // Get FCM token from customer
            const title = 'Check Total Amount';
            const body = `Your order: ${updatedOrder.orderMessage}. Total Amount : ₹${updatedOrder.totalAmount}.`;
            try {
                // Assuming you have a function or service to send push notifications
                let pushNotificationRes = await sendPushNotification(fcmtoken, title, body);

            } catch (error) {
                console.error('Error sending push notification:', error);
            }

        }

        return res.status(200).json({ message: 'ChatOrder updated successfully', order: updatedOrder });
    } catch (error) {
        console.error('Error updating chat order:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getChatOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

        // Find the order by orderId or numeric orderId
        const query = mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId: orderId };
        const order = await ChatOrder.findOne(query)
            .populate('customer')
            .populate('vendor')
            .populate('driverId');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        return res.status(200).json(order);
    } catch (error) {
        console.error('Error fetching chat order:', error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};







// Function to get all ChatOrders of a particular customer
const getChatOrdersByCustomer = async (req, res) => {
    try {
        const customerId = req.params.customerId;


        // Verify that the customer exists
        const customerExists = await Customer.findById(customerId);
        if (!customerExists) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Find all chat orders for the specified customer, sorted by createdAt in descending order
        const chatOrders = await ChatOrder.find({
            customer: customerId,
            orderStatus: { $nin: ['Delivered', 'Cancelled'] }
        })
            .populate('customer')
            .populate('vendor')
            .populate('driverId')
            .sort({ createdAt: -1 });

        return res.status(200).json(chatOrders);
    } catch (error) {
        console.error('Error fetching chat orders:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getChatOrdersHistoryByCustomer = async (req, res) => {
    try {
        const customerId = req.params.customerId;

        // Verify that the customer exists
        const customerExists = await Customer.findById(customerId);
        if (!customerExists) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Find all chat orders for the specified customer, sorted by createdAt in descending order
        const chatOrders = await ChatOrder.find({
            customer: customerId,
            orderStatus: { $in: ['Delivered', 'Cancelled'] }
        })
            .populate('customer')
            .populate('vendor')
            .sort({ createdAt: -1 });


        return res.status(200).json(chatOrders);
    } catch (error) {
        console.error('Error fetching chat orders:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


const updateChatOrderStatus = async (req, res) => {
    const { orderId } = req.params;
    const { newStatus } = req.body;


    try {
        // Prepare the update object
        let updateData = { orderStatus: newStatus };
        if (newStatus === 'Shipped') {
            updateData.arrivalAt = new Date(Date.now() + 15 * 60 * 1000); // Set arrival time to 15 minutes from now
        }

        // Find the order by ID or numeric orderID and update the status
        const query = mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId: orderId };
        const order = await ChatOrder.findOneAndUpdate(
            query,
            { $set: updateData },
            { new: true }
        );

        // ===== Auto-Block Logic for Vendor (Chat Order) =====
        if (newStatus === 'Cancelled' && order) {
            try {
                const vendorId = order.vendor;
                const vendorDoc = await Vendor.findById(vendorId);
                if (vendorDoc) {
                    vendorDoc.rejectionCount = (vendorDoc.rejectionCount || 0) + 1;

                    // Check if threshold reached (3 rejections)
                    if (vendorDoc.rejectionCount >= 3) {
                        vendorDoc.isBlocked = true;
                        vendorDoc.blockedAt = new Date();
                        console.log(`Vendor ${vendorId} blocked due to ${vendorDoc.rejectionCount} rejections (Chat Order).`);
                        // Send email notification
                        emailService.sendVendorBlockEmail(vendorDoc.email, vendorDoc.name).catch(e => console.error("Email fail:", e));
                    }
                    await vendorDoc.save();
                }
            } catch (blockError) {
                console.error('Error in vendor auto-block logic (Chat Order):', blockError);
            }
        }
        // ====================================================

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // If the new status is 'Delivered', calculate and update deliveredInMin
        if (newStatus === 'Delivered') {
            const currentTime = new Date();
            const createdAt = order.createdAt;
            const deliveredInMin = Math.floor((currentTime - createdAt) / 60000); // Difference in minutes

            order.deliveredInMin = deliveredInMin;

            // Save the updated order
            await order.save();
        }

        // Extract customer ID from the order
        const customerId = order.customer._id;

        // Retrieve the customer from database to get FCM token
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const fcmtoken = customer.fcmDeviceToken; // Get FCM token from customer

        const title = 'Chat Order Status Updated';
        const body = `The status of your chat order: ${order.orderMessage}, has been updated to ${newStatus}.`;
        try {
            // Assuming you have a function or service to send push notifications
            let pushNotificationRes = await sendPushNotification(fcmtoken, title, body);

        } catch (error) {
            console.error('Error sending push notification:', error);
        }

        res.json(order);
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


const getChatOrdersByVendor = async (req, res) => {
    try {
        const vendorId = new mongoose.Types.ObjectId(req.params.vendorId);

        // Fetch the vendor's role using the vendorId
        const vendor = await Vendor.findById(vendorId).select('role');

        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: 'Vendor not found'
            });
        }

        const { startDate, endDate, dateField } = req.query;
        let dateMatch = {};
        if (startDate && endDate) {
            const field = dateField || 'createdAt';
            dateMatch = {
                [field]: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        const pipeline = [
            { $match: dateMatch }
        ];

        // Include the $match stage only if the vendor's role is not 'admin'
        if (vendor.role !== 'admin') {
            pipeline.push({ $match: { "vendor": vendorId } });
        }

        const vendorOrders = await ChatOrder.aggregate([
            ...pipeline,
            {
                $lookup: {
                    from: "customers", // The name of the customers collection
                    localField: "customer",
                    foreignField: "_id",
                    as: "customerDetails"
                }
            },
            // Unwind the customerDetails array to get the object
            { $unwind: "$customerDetails" },
            // Lookup to join vendor details
            {
                $lookup: {
                    from: "vendors", // The name of the vendors collection
                    localField: "vendor",
                    foreignField: "_id",
                    as: "vendorDetails"
                }
            },
            // Unwind the vendorDetails array to get the object
            { $unwind: "$vendorDetails" },
            // Lookup to join driver details
            {
                $lookup: {
                    from: "drivers",
                    localField: "driverId",
                    foreignField: "_id",
                    as: "driverDetails"
                }
            },
            { $unwind: { path: "$driverDetails", preserveNullAndEmptyArrays: true } },
            // Group the data by order
            {
                $group: {
                    _id: {
                        orderId: "$_id",
                        shortId: "$orderId",
                        orderStatus: "$orderStatus",
                        customer: "$customerDetails",
                        shippingAddress: "$shippingAddress",
                        orderMessage: "$orderMessage",
                        vendor: "$vendorDetails",
                        driver: "$driverDetails", // Include driver
                        totalAmount: "$totalAmount",
                        isPaymentVerified: "$isPaymentVerified",
                        paymentStatus: "$paymentStatus",
                        products: "$products",
                        createdAt: "$createdAt",
                        is_new: "$is_new",
                        deliveryCharge: "$deliveryCharge",
                        shippingFee: "$shippingFee",
                        // Financial Fields
                        vendorPaymentStatus: "$vendorPaymentStatus",
                        driverEarningStatus: "$driverEarningStatus",
                        floatingCashStatus: "$floatingCashStatus",
                        floatingCashAmount: "$floatingCashAmount",
                        deliveredAt: "$deliveredAt",
                        vendorBillFile: "$vendorBillFile"
                    }
                }
            },
            // Project to reshape the output document
            {
                $project: {
                    _id: "$_id.orderId", // Change back to _id as root
                    orderId: "$_id.orderId",
                    shortId: "$_id.shortId",
                    orderStatus: "$_id.orderStatus",
                    customer: "$_id.customer",
                    shippingAddress: "$_id.shippingAddress",
                    isPaymentVerified: "$_id.isPaymentVerified",
                    paymentStatus: "$_id.paymentStatus",
                    products: "$_id.products",
                    createdAt: "$_id.createdAt",
                    deliveredAt: "$_id.deliveredAt", // Added deliveredAt
                    is_new: "$_id.is_new",
                    orderMessage: "$_id.orderMessage",
                    totalAmount: "$_id.totalAmount",
                    deliveryCharge: "$_id.deliveryCharge",
                    shippingFee: "$_id.shippingFee",
                    driverId: "$_id.driver", // Include driver in root
                    vendorPaymentStatus: "$_id.vendorPaymentStatus",
                    driverEarningStatus: "$_id.driverEarningStatus",
                    floatingCashStatus: "$_id.floatingCashStatus",
                    floatingCashAmount: "$_id.floatingCashAmount",
                    vendorBillFile: "$_id.vendorBillFile",
                    deliveredAt: "$_id.deliveredAt",
                    vendors: {
                        vendor: "$_id.vendor",
                        orderStatus: "$_id.orderStatus"
                    }
                }
            },
            // Sort by createdAt in descending order
            { $sort: { createdAt: -1 } }
        ]);

        res.status(200).json({
            success: true,
            data: vendorOrders
        });
    } catch (error) {
        console.error("Error fetching orders for vendor: ", error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

const updateOrderAmountAndStatus = async (req, res) => {

    try {
        const { chatOrderId, totalAmount } = req.body;




        if (!chatOrderId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Chat Order ID'
            });
        }

        if (typeof totalAmount !== 'number' || totalAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid total amount'
            });
        }

        const updatedOrder = await ChatOrder.findOneAndUpdate(
            { _id: chatOrderId }, // Find by orderId field
            {
                totalAmount: totalAmount,
                orderStatus: 'Pending',
                updatedAt: new Date()
            },
            { new: true }
        );




        if (!updatedOrder) {
            return res.status(404).json({
                success: false,
                message: 'Chat Order not found'
            });
        }

        res.status(200).json({
            success: true,
            data: updatedOrder
        });
    } catch (error) {
        console.error('Error updating Chat Order: ', error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

const updateChatPaymentStatusManually = async (req, res) => {
    try {

        // Extract required fields from the request body
        const { orderId, newStatus } = req.body;



        // Ensure all required fields are present
        if (!newStatus || !orderId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Find the order in the database using the orderId
        let order = await ChatOrder.findById(orderId);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (newStatus === 'Paid') {
            order.isPaymentVerified = true;
            order.paymentStatus = 'Paid';
        } else {
            order.isPaymentVerified = false;
            order.paymentStatus = 'Unpaid';
        }



        // Save the updated order
        const updatedOrder = await order.save();

        res.status(200).json(updatedOrder);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};



const getNewChatOrdersCountByVendor = async (req, res) => {

    try {
        const vendorId = req.params.vendorId; // Assuming vendorId is passed as a URL parameter

        // Count new orders for the specific vendor
        const newOrdersCount = await ChatOrder.countDocuments({
            'vendor': vendorId,
            is_new: true
        });



        res.status(200).json({ newOrdersCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while retrieving new orders count.' });
    }
};


const markChatOrderViewed = async (req, res) => {

    try {
        const vendorId = req.params.vendorId;

        // Update only the orders for the given vendor to set is_new to false
        await ChatOrder.updateMany(
            { "vendor": vendorId, is_new: true },
            { $set: { is_new: false } }
        );

        res.status(200).json({ message: 'Vendor-specific orders marked as viewed' });
    } catch (error) {
        res.status(500).json({ message: 'An error occurred while marking orders as viewed', error: error.message });
    }
};
const getChatOrderInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const query = mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId: orderId };
        const order = await ChatOrder.findOne(query)
            .populate('customer')
            .populate('vendor');

        if (!order) {
            return res.status(404).send('Order not found');
        }

        const totalAmount = parseFloat(order.totalAmount || 0);
        const deliveryCharge = parseFloat(order.deliveryCharge || 0);
        const grandTotal = totalAmount + deliveryCharge;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice #${order.shortId}</title>
    <style>
        body { font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; color: #555; }
        .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, .15); font-size: 16px; line-height: 24px; color: #555; }
        .invoice-box table { width: 100%; line-height: inherit; text-align: left; border-collapse: collapse; }
        .invoice-box table td { padding: 5px; vertical-align: top; }
        .invoice-box table tr td:nth-child(2) { text-align: right; }
        .invoice-box table tr.top table td { padding-bottom: 20px; }
        .invoice-box table tr.top table td.title { font-size: 45px; line-height: 45px; color: #333; }
        .invoice-box table tr.information table td { padding-bottom: 40px; }
        .invoice-box table tr.heading td { background: #eee; border-bottom: 1px solid #ddd; font-weight: bold; }
        .invoice-box table tr.details td { padding-bottom: 20px; }
        .invoice-box table tr.item td { border-bottom: 1px solid #eee; }
        .invoice-box table tr.item.last td { border-bottom: none; }
        .invoice-box table tr.total td:nth-child(2) { border-top: 2px solid #eee; font-weight: bold; }
        @media only screen and (max-width: 600px) {
            .invoice-box table tr.top table td { width: 100%; display: block; text-align: center; }
            .invoice-box table tr.information table td { width: 100%; display: block; text-align: center; }
        }
    </style>
</head>
<body>
    <div class="invoice-box">
        <table>
            <tr class="top">
                <td colspan="2">
                    <table>
                        <tr>
                            <td class="title">SevaBazar</td>
                            <td>
                                Invoice #: ${order.shortId}<br>
                                Created: ${new Date(order.createdAt).toLocaleDateString()}<br>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <tr class="information">
                <td colspan="2">
                    <table>
                        <tr>
                            <td>
                                <strong>Vendor:</strong><br>
                                ${order.vendor?.name || 'N/A'}<br>
                                ${order.vendor?.email || ''}
                            </td>
                            <td>
                                <strong>Customer:</strong><br>
                                ${order.customer?.name || order.name || 'N/A'}<br>
                                ${order.customer?.contactNumber || ''}
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <tr class="heading">
                <td>Item</td>
                <td>Price</td>
            </tr>
            ${order.products.map(product => `
            <tr class="item">
                <td>${product.name} (x${product.quantity || 1})</td>
                <td>₹${parseFloat(product.totalAmount || 0).toFixed(2)}</td>
            </tr>
            `).join('')}
            <tr class="total">
                <td></td>
                <td>Subtotal: ₹${totalAmount.toFixed(2)}</td>
            </tr>
            <tr class="total">
                <td></td>
                <td>Delivery: ₹${deliveryCharge.toFixed(2)}</td>
            </tr>
            <tr class="total">
                <td></td>
                <td>Total: ₹${grandTotal.toFixed(2)}</td>
            </tr>
        </table>
        <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #999;">
            Thank you for shopping with SevaBazar!
        </div>
    </div>
</body>
</html>`;
        res.set('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send('Internal Server Error');
    }
};

module.exports = {
    createChatOrder,
    getChatOrdersByCustomer,
    updateChatOrderStatus,
    getChatOrdersByVendor,
    updateOrderAmountAndStatus,
    updateChatPaymentStatusManually,
    getNewChatOrdersCountByVendor,
    markChatOrderViewed,
    updateChatOrder,
    getChatOrder,
    getChatOrdersHistoryByCustomer,
    getChatOrderInvoice
};
