const ChatOrder = require('./model'); // Adjust the path as necessary
const Customer = require('../Customer/model'); // Assuming you have a Customer model
const Vendor = require('../Vendor/model'); // Assuming you have a Customer model
const mongoose = require('mongoose');
const emailService = require('../utils/emailService');
const { sendPushNotification } = require('../utils/pushNotificationUtil');

const Settings = require('../Settings/model');

function calculateDistance(lat1, lon1, lat2, lon2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371; // Radius of the Earth in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Function to create a new ChatOrder
const createChatOrder = async (req, res) => {
    console.log("api is hiiting")
    try {
        const { orderMessage, customer, name, shippingAddress, paymentStatus } = req.body;
        // Validate required fields
        if (!orderMessage || !customer || !shippingAddress || !shippingAddress.address || !shippingAddress.city || !shippingAddress.state || !shippingAddress.country || !shippingAddress.postalCode) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Verify that the customer exists
        const customerExists = await Customer.findById(customer);
        if (!customerExists) {
            return res.status(404).json({ message: 'Customer not found' });
        }


        // Calculate Delivery Charge
        const vendorId = req.body.vendorId;
        const vendorDetails = await Vendor.findById(vendorId);
        
        let deliveryCharge = 0;
        let distance = 0;

        if (vendorDetails && vendorDetails.location && vendorDetails.location.coordinates && shippingAddress.latitude && shippingAddress.longitude) {
            const vendorLat = vendorDetails.location.coordinates[1];
            const vendorLon = vendorDetails.location.coordinates[0];
            distance = calculateDistance(vendorLat, vendorLon, shippingAddress.latitude, shippingAddress.longitude);
            
            // Fetch settings for delivery charge configuration
            const settings = await Settings.findOne();
            const deliveryChargeConfig = settings?.deliveryChargeConfig || [];
            
             const match = deliveryChargeConfig.find(tier => {
                const type = tier.conditionType || 'range';
                if (type === 'range') {
                        return distance >= tier.minDistance && distance < tier.maxDistance;
                } else if (type === 'greaterThan') {
                        return distance > tier.minDistance;
                } else if (type === 'lessThan') {
                        return distance < tier.maxDistance;
                }
                return false;
            });

            if (match) {
                deliveryCharge = match.deliveryFee;
            }
        }

const SHIPPING_FEE = 9;

        // Create a new chat order
        const newChatOrder = new ChatOrder({

            orderMessage,
            customer,
            name,
            shippingAddress,
            paymentStatus,
            vendor: req.body.vendorId, // Assign the vendor if provided
            is_new: true,
            deliveryCharge,
            distance,
            shippingFee: SHIPPING_FEE
        });

        // Save the order to the database
        const savedOrder = await newChatOrder.save();

        // console.log("savedOrder->", savedOrder)


        // Fetch the vendor's role using the vendorId
        // const vendorDetails = await Vendor.findById(savedOrder.vendor)
        const customerDetails = await Customer.findById(savedOrder.customer)

        // console.log("vendorDetails->", vendorDetails)

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

        // Find the order by orderId
        const order = await ChatOrder.findOne({ _id: orderId });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Update the products and calculate the total amount
        order.products = products;
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
                console.log("Push notification response:", pushNotificationRes);
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

        // Find the order by orderId
        const order = await ChatOrder.findOne({ _id: orderId }).populate('customer').populate('vendor');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        return res.status(200).json(order);
    } catch (error) {
        console.error('Error fetching chat order:', error);
        return res.status(500).json({ message: 'Internal server error' });
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

    console.log("orderId, newStatus==>>", orderId, newStatus);

    try {
        // Prepare the update object
        let updateData = { orderStatus: newStatus };
        if (newStatus === 'Shipped') {
            updateData.arrivalAt = new Date(Date.now() + 15 * 60 * 1000); // Set arrival time to 15 minutes from now
        }

        // Find the order by ID and update the status
        const order = await ChatOrder.findOneAndUpdate(
            { _id: orderId },
            { $set: updateData },
            { new: true }
        );

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
            console.log("Push notification response:", pushNotificationRes);
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

        const pipeline = [
            { $unwind: "$vendor" }
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
                        orderStatus: "$orderStatus",
                        totalAmount: "$totalAmount",
                        isPaymentVerified: "$isPaymentVerified",
                        paymentStatus: "$paymentStatus",
                        products: "$products",
                        createdAt: "$createdAt",
                        is_new: "$is_new"
                    }
                }
            },
            // Project to reshape the output document
            {
                $project: {
                    _id: 0,
                    orderId: "$_id.orderId",
                    shortId: "$_id.shortId",
                    orderStatus: "$_id.orderStatus",
                    customer: "$_id.customer",
                    shippingAddress: "$_id.shippingAddress",
                    isPaymentVerified: "$_id.isPaymentVerified",
                    paymentStatus: "$_id.paymentStatus",
                    products: "$_id.products",
                    createdAt: "$_id.createdAt",
                    is_new: "$_id.is_new",
                    orderMessage: "$_id.orderMessage",
                    totalAmount: "$_id.totalAmount",
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
    console.log("updateOrderAmountAndStatus api")
    try {
        const { chatOrderId, totalAmount } = req.body;

        console.log("chatOrderId, totalAmount-->>", chatOrderId, totalAmount)


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
        console.log("updatePaymentStatus")
        // Extract required fields from the request body
        const { orderId, newStatus } = req.body;

        console.log("orderId, newStatus-->>", orderId, newStatus)

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
    console.log("it is called?")
    try {
        const vendorId = req.params.vendorId; // Assuming vendorId is passed as a URL parameter

        // Count new orders for the specific vendor
        const newOrdersCount = await ChatOrder.countDocuments({
            'vendor': vendorId,
            is_new: true
        });

        console.log("newchatOrdersCount-->>", newOrdersCount)

        res.status(200).json({ newOrdersCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while retrieving new orders count.' });
    }
};


const markChatOrderViewed = async (req, res) => {
    console.log("markOrderViewed is called")
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
module.exports = { createChatOrder, getChatOrdersByCustomer, updateChatOrderStatus, getChatOrdersByVendor, updateOrderAmountAndStatus, updateChatPaymentStatusManually, getNewChatOrdersCountByVendor, markChatOrderViewed, updateChatOrder, getChatOrder , getChatOrdersHistoryByCustomer};
