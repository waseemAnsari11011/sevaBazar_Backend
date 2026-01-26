const Driver = require('../Driver/model');
const Order = require('../Order/model');
const { Product } = require('../Product/model');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Vendor = require('../Vendor/model');
const Customer = require('../Customer/model')
const Settings = require('../Settings/model');
const emailService = require('../utils/emailService');
const { sendPushNotification } = require('../utils/pushNotificationUtil');
const { calculateDistance, calculateDeliveryFee } = require('../Driver/pricingUtil');

//razorpay
const razorpay = new Razorpay({
    key_id: process.env.KEY_ID,
    key_secret: process.env.KEY_SECRET
});

exports.createOrderRazorpay = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { customer, vendors, shippingAddress } = req.body;

        // Validate required fields
        if (!customer || !vendors || !shippingAddress) {
            return res.status(400).json({ error: 'All required fields must be provided' });
        }

        // Validate each vendor and their products
        for (const vendor of vendors) {
            if (!vendor.vendor || !vendor.products) {
                return res.status(400).json({ error: 'Each vendor must have a vendor ID and a list of products' });
            }
            for (const product of vendor.products) {
                if (!product.product || !product.quantity || !product.price || !product.variations) {
                    return res.status(400).json({ error: 'Each product must have a product ID, quantity, and price' });
                }
            }
        }

        for (const vendor of vendors) {
            for (const productInfo of vendor.products) {
                const product = await Product.findById(productInfo.product);
                if (!product) {
                    return res.status(400).json({ error: `Product with ID ${productInfo.product} not found` });
                }
                if (product.quantity < productInfo.quantity) {
                    return res.status(400).json({ error: `Not enough quantity available for product ${product.name}` });
                }
            }
        }

        // Fetch settings for delivery charge configuration
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({ vendorVisibilityRadius: 10 });
        }

        // Calculate delivery charges for each vendor
        for (const vendor of vendors) {
            if (!mongoose.Types.ObjectId.isValid(vendor.vendor)) {
                return res.status(400).json({ error: `Invalid Vendor ID: ${vendor.vendor}. Please use the MongoDB _id string instead of email/name.` });
            }
            const vendorDetails = await Vendor.findById(vendor.vendor);
            if (vendorDetails && vendorDetails.location && vendorDetails.location.coordinates && shippingAddress.latitude && shippingAddress.longitude) {
                const vendorLat = vendorDetails.location.coordinates[1];
                const vendorLon = vendorDetails.location.coordinates[0];
                const distance = calculateDistance(vendorLat, vendorLon, shippingAddress.latitude, shippingAddress.longitude);

                vendor.deliveryCharge = Number(calculateDeliveryFee(distance, settings).toFixed(2));
                vendor.distance = Number(distance.toFixed(2));
            } else {
                vendor.deliveryCharge = 0; // Default if coordinates missing
            }
        }

        // Create a new order instance
        const newOrder = new Order({
            customer,
            vendors,
            shippingAddress,
            shippingFee: 9 // Fixed shipping fee
        });

        // Save the order to the database
        const savedOrder = await newOrder.save();

        // Calculate total amount for the order
        let totalAmount = 0;
        savedOrder.vendors.forEach(vendor => {
            vendor.products.forEach(product => {
                totalAmount += product.totalAmount;
            });
            totalAmount += (vendor.deliveryCharge || 0);
        });

        const SHIPPING_FEE = 9;
        totalAmount += SHIPPING_FEE;

        // Create Razorpay order
        const options = {
            amount: totalAmount * 100, // Amount in paisa
            currency: 'INR',
            receipt: savedOrder._id.toString()
        };
        const razorpayOrder = await razorpay.orders.create(options);

        await session.commitTransaction();
        session.endSession();

        // Send response with order details and Razorpay order
        res.status(201).json({
            order: savedOrder,
            razorpayOrder
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("error--->>", error)
        res.status(400).json({ error: error.message });
    }
};


exports.updatePaymentStatus = async (req, res) => {

    try {
        // Extract required fields from the request body
        const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature, vendors } = req.body;

        console.log("vendors-->>", vendors)

        // Ensure all required fields are present
        if (!orderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Find the order in the database using the orderId
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Create a hmac object using the key_secret
        const hmac = crypto.createHmac('sha256', razorpay.key_secret);

        // Generate the expected signature
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const generated_signature = hmac.digest('hex');

        // Verify the signature
        if (generated_signature === razorpay_signature) {
            // Update the order status to reflect successful payment
            order.isPaymentVerified = true;
            order.paymentStatus = 'Paid';
            order.razorpay_payment_id = razorpay_payment_id;
            order.razorpay_order_id = razorpay_order_id;
            order.razorpay_signature = razorpay_signature;

            // Update product quantities and save the order to the database
            for (const vendor of vendors) {
                for (const productInfo of vendor.products) {
                    const product = await Product.findById(productInfo.product).populate('variations');

                    if (product) {
                        // Update variations
                        for (const orderedVariation of productInfo.variations) {
                            const productVariation = product.variations.find(
                                variation => variation._id.toString() === orderedVariation._id
                            );

                            if (productVariation) {
                                productVariation.quantity -= orderedVariation.quantity;
                                await productVariation.save();
                            }
                        }

                        // Update parent product quantity
                        const totalQuantity = product.variations.reduce((sum, variation) => sum + variation.quantity, 0);
                        product.quantity = totalQuantity;
                        await product.save();
                    }
                }
            }

        } else {
            // Update the order status to reflect failed payment
            order.isPaymentVerified = false;
            order.paymentStatus = 'Unpaid';
        }

        // Save the updated order
        const updatedOrder = await order.save();

        res.status(200).json(updatedOrder);
    } catch (error) {
        console.log("error-->>", error)
        res.status(400).json({ error: error.message });
    }
};

exports.updatePaymentStatusManually = async (req, res) => {
    try {
        console.log("updatePaymentStatus")
        // Extract required fields from the request body
        const { orderId, newStatus } = req.body;

        // Ensure all required fields are present
        if (!newStatus || !orderId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Find the order in the database using the orderId
        let order = await Order.findById(orderId);

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


//

exports.createOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { customer, vendors, shippingAddress } = req.body;

        console.log("shippingAddress==>>>>", shippingAddress)

        // Validate required fields
        if (!customer || !vendors || !shippingAddress) {
            return res.status(400).json({ error: 'All required fields must be provided' });
        }
        const customerDetails = await Customer.findById(customer);
        console.log("customerDetails--->", customerDetails)


        // Validate each vendor and their products
        for (const vendor of vendors) {
            if (!vendor.vendor || !vendor.products) {
                return res.status(400).json({ error: 'Each vendor must have a vendor ID and a list of products' });
            }
            for (const product of vendor.products) {
                if (!product.product || !product.quantity || !product.price || !product.variations) {
                    return res.status(400).json({ error: 'Each product must have a product ID, quantity, and price' });
                }
            }
        }

        // Fetch settings for delivery charge configuration
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({ vendorVisibilityRadius: 10 });
        }

        // Calculate delivery charges for each vendor
        for (const vendor of vendors) {
            const vId = vendor.vendor;
            if (!mongoose.Types.ObjectId.isValid(vId)) {
                return res.status(400).json({ error: `Invalid Vendor ID: ${vId}. Please use the MongoDB _id string.` });
            }
            const vendorDetails = await Vendor.findById(vId);
            if (vendorDetails && vendorDetails.location && vendorDetails.location.coordinates && shippingAddress.latitude && shippingAddress.longitude) {
                const vendorLat = vendorDetails.location.coordinates[1];
                const vendorLon = vendorDetails.location.coordinates[0];
                const distance = calculateDistance(vendorLat, vendorLon, shippingAddress.latitude, shippingAddress.longitude);

                vendor.distance = Number(distance.toFixed(2)); // Save the distance
                vendor.deliveryCharge = Number(calculateDeliveryFee(distance, settings).toFixed(2));
            } else {
                vendor.deliveryCharge = 0;
            }
        }



        // Update product quantities and save the order to the database
        for (const vendor of vendors) {
            for (const productInfo of vendor.products) {
                // Fetch product and populate variations
                const product = await Product.findById(productInfo.product).populate('variations');
                if (!product) {
                    return res.status(400).json({ error: `Product with ID ${productInfo.product} not found` });
                }

                // Loop through each ordered variation
                for (const orderedVariation of productInfo.variations) {
                    // Find the matching variation in the product's populated variations
                    // Note: orderedVariation._id is the variation ID
                    const productVariation = product.variations.find(
                        variation => variation._id.toString() === orderedVariation._id
                    );

                    if (productVariation) {
                        // Decrease the quantity of the matching variation by the ordered quantity
                        productVariation.quantity -= orderedVariation.quantity;

                        // Check for negative quantity
                        if (productVariation.quantity < 0) {
                            return res.status(400).json({ error: `Insufficient quantity for variation ${orderedVariation._id}` });
                        }

                        // Save the updated variation document
                        await productVariation.save();

                        // Update discount
                        if (productVariation.discount && productVariation.discount > 0) {
                            productInfo.discount = Math.max(productInfo.discount || 0, productVariation.discount);
                        }
                    } else {
                        return res.status(400).json({ error: `Variation with ID ${orderedVariation._id} not found in product ${productInfo.product}` });
                    }
                }

                // Recalculate total quantity from updated variations
                // We need to re-fetch or use the updated instances
                const totalQuantity = product.variations.reduce((sum, variation) => sum + variation.quantity, 0);

                // Update the root-level quantity of the product
                product.quantity = totalQuantity;
                productInfo.name = product.name;

                // Save the updated product document
                await product.save();
            }
        }

        // Create a new order instance
        const newOrder = new Order({
            customer,
            vendors,
            shippingAddress,
            name: customerDetails.name,
            shippingFee: 9 // Fixed shipping fee
        });

        console.log("vendor-->>", vendors[0].products)

        // Save the order to the database
        const savedOrder = await newOrder.save();

        // Send order confirmation email to customer
        // await emailService.sendOrderConfirmationEmail(customer.email, savedOrder);




        // Send new order notification email to each vendor
        for (const vendor of vendors) {

            const vendorId = new mongoose.Types.ObjectId(vendor.vendor);

            // Fetch the vendor's role using the vendorId
            const vendorDetails = await Vendor.findById(vendorId)

            // console.log("vendor.vendor.email-->>", vendorDetails)

            await emailService.sendNewOrderNotificationEmail(vendorDetails.email, savedOrder, customerDetails.contactNumber);
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json(savedOrder);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ error: error.message });
    }
};


// Controller function to get all orders for a particular vendor

exports.getOrdersByVendor = async (req, res) => {
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
            { $unwind: { path: "$vendors", preserveNullAndEmptyArrays: true } }
        ];

        // Include the $match stage only if the vendor's role is not 'admin'
        if (vendor.role !== 'admin') {
            pipeline.push({ $match: { "vendors.vendor": vendorId } });
        }

        const vendorOrders = await Order.aggregate([
            {
                $addFields: {
                    customer: {
                        $cond: {
                            if: { $eq: [{ $type: "$customer" }, "string"] },
                            then: { $toObjectId: "$customer" },
                            else: "$customer"
                        }
                    }
                }
            },
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
            { $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true } },
            // Lookup to join vendor details
            {
                $lookup: {
                    from: "vendors", // The name of the vendors collection
                    localField: "vendors.vendor",
                    foreignField: "_id",
                    as: "vendorDetails"
                }
            },
            // Unwind the vendorDetails array to get the object
            { $unwind: { path: "$vendorDetails", preserveNullAndEmptyArrays: true } },
            // Unwind the products array to work with individual product documents
            { $unwind: { path: "$vendors.products", preserveNullAndEmptyArrays: true } },
            // Lookup to join product details
            {
                $lookup: {
                    from: "products", // The name of the products collection
                    localField: "vendors.products.product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            // Unwind the productDetails array to get the object
            { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
            // Group back the products and vendors
            {
                $group: {
                    _id: {
                        orderId: "$_id",
                        shortId: "$orderId",
                        customer: "$customerDetails",
                        shippingAddress: "$shippingAddress",
                        vendor: "$vendorDetails",
                        orderStatus: "$vendors.orderStatus",
                        isPaymentVerified: "$isPaymentVerified",
                        paymentStatus: "$paymentStatus",
                        razorpay_payment_id: "$razorpay_payment_id",
                        createdAt: "$createdAt",
                        is_new: "$is_new"
                    },
                    totalAmount: { $sum: "$vendors.products.totalAmount" },
                    products: {
                        $push: {
                            product: "$productDetails",
                            quantity: "$vendors.products.quantity",
                            price: "$vendors.products.price"
                        }
                    }
                }
            },
            // Project to reshape the output document
            {
                $project: {
                    _id: 0,
                    orderId: "$_id.orderId",
                    shortId: "$_id.shortId",
                    customer: "$_id.customer",
                    shippingAddress: "$_id.shippingAddress",
                    isPaymentVerified: "$_id.isPaymentVerified",
                    paymentStatus: "$_id.paymentStatus",
                    razorpay_payment_id: "$_id.razorpay_payment_id",
                    createdAt: "$_id.createdAt",
                    is_new: "$_id.is_new",
                    totalAmount: 1,
                    vendors: {
                        vendor: "$_id.vendor",
                        orderStatus: "$_id.orderStatus",
                        products: "$products"
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
exports.getNewOrdersCountByVendor = async (req, res) => {
    try {
        const vendorId = req.params.vendorId; // Assuming vendorId is passed as a URL parameter

        // Count new orders for the specific vendor
        const newOrdersCount = await Order.countDocuments({
            'vendors.vendor': vendorId,
            is_new: true
        });

        // console.log("newOrdersCount-->>", newOrdersCount)

        res.status(200).json({ newOrdersCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while retrieving new orders count.' });
    }
};


exports.getRecentOrdersByVendor = async (req, res) => {
    try {
        const vendorId = new mongoose.Types.ObjectId(req.params.vendorId);

        const recentVendorOrders = await Order.aggregate([
            { $unwind: "$vendors" },
            { $match: { "vendors.vendor": vendorId } },
            {
                $lookup: {
                    from: "customers",
                    localField: "customer",
                    foreignField: "_id",
                    as: "customerDetails"
                }
            },
            { $unwind: "$customerDetails" },
            {
                $lookup: {
                    from: "vendors",
                    localField: "vendors.vendor",
                    foreignField: "_id",
                    as: "vendorDetails"
                }
            },
            { $unwind: "$vendorDetails" },
            { $unwind: "$vendors.products" },
            {
                $lookup: {
                    from: "products",
                    localField: "vendors.products.product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $group: {
                    _id: {
                        orderId: "$_id",
                        customer: "$customerDetails",
                        shippingAddress: "$shippingAddress",
                        vendor: "$vendorDetails",
                        orderStatus: "$vendors.orderStatus",
                        isPaymentVerified: "$isPaymentVerified",
                        paymentStatus: "$paymentStatus",
                        razorpay_payment_id: "$razorpay_payment_id",
                        createdAt: "$createdAt"
                    },
                    products: {
                        $push: {
                            product: "$productDetails",
                            quantity: "$vendors.products.quantity",
                            price: "$vendors.products.price",
                            discount: "$vendors.products.discount",
                            _id: "$vendors.products._id",
                            totalAmount: "$vendors.products.totalAmount"
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    orderId: "$_id.orderId",
                    customer: "$_id.customer",
                    shippingAddress: "$_id.shippingAddress",
                    isPaymentVerified: "$_id.isPaymentVerified",
                    paymentStatus: "$_id.paymentStatus",
                    razorpay_payment_id: "$_id.razorpay_payment_id",
                    createdAt: "$_id.createdAt",
                    vendors: {
                        vendor: "$_id.vendor",
                        orderStatus: "$_id.orderStatus",
                        products: "$products"
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            { $limit: 5 }
        ]);

        res.status(200).json({
            success: true,
            data: recentVendorOrders
        });
    } catch (error) {
        console.error("Error fetching recent orders for vendor: ", error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};



exports.updateOrderStatus = async (req, res) => {
    const { orderId, vendorId } = req.params;
    const { newStatus, pickupOtp: enteredOtp } = req.body;

    try {
        // Find the order first to check for OTP if needed
        // Flexibly handle both MongoDB _id and custom 6-digit orderId
        const query = mongoose.Types.ObjectId.isValid(orderId)
            ? { _id: orderId }
            : { orderId: orderId };

        const existingOrder = await Order.findOne(query);
        if (!existingOrder) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // If shifting to 'Shipped', verify OTP if a driver is assigned
        if (newStatus === 'Shipped' && existingOrder.driverId) {
            if (!enteredOtp) {
                return res.status(400).json({ error: 'Pickup OTP is required for handover' });
            }
            if (Number(enteredOtp) !== existingOrder.pickupOtp) {
                return res.status(400).json({ error: 'Invalid Pickup OTP. Please check with the driver.' });
            }
        }

        // Find the order by custom orderId (6-digit) or _id and update the status for the specific vendor
        const updateQuery = mongoose.Types.ObjectId.isValid(orderId)
            ? { _id: orderId, 'vendors.vendor': new mongoose.Types.ObjectId(vendorId) }
            : { orderId: orderId, 'vendors.vendor': new mongoose.Types.ObjectId(vendorId) };

        const order = await Order.findOneAndUpdate(
            updateQuery,
            { $set: { 'vendors.$.orderStatus': newStatus } },
            { new: true }
        ).populate('customer'); // Ensure customer details are populated

        if (!order) {
            return res.status(404).json({ error: 'Order or vendor not found' });
        }

        // ===== NEW: Notify drivers when vendor accepts order (status → Processing) =====
        if (newStatus === 'Processing' && !order.driverId) {
            try {
                const { findNearestDrivers } = require('../Driver/controller');
                const driverIds = await findNearestDrivers({ vendorId, orderId: order.orderId });

                if (driverIds.length > 0) {
                    console.log(`Order ${order.orderId} offered to ${driverIds.length} drivers via findNearestDrivers`);
                }
            } catch (driverError) {
                console.error('Error notifying drivers:', driverError);
                // Don't fail the status update if driver notification fails
            }
        }
        // ===== END: Driver notification =====

        // If the new status is 'Shipped', set arrivalAt to 15 minutes from now
        if (newStatus === 'Shipped') {
            const deliveryTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

            order.vendors.forEach(vendor => {
                if (vendor.vendor.toString() === vendorId.toString()) {
                    vendor.products.forEach(product => {
                        product.arrivalAt = deliveryTime;
                    });
                }
            });
            // Save the updated arrival times
            await order.save();
        }

        // If the new status is 'Delivered', calculate and update deliveredInMin at the vendor level
        if (newStatus === 'Delivered') {
            const currentTime = new Date();
            const createdAt = order.createdAt;
            const deliveredInMin = Math.floor((currentTime - createdAt) / 60000); // Difference in minutes
            console.log("deliveredInMin-->", deliveredInMin)

            // Update the deliveredInMin field for the specific vendor
            order.vendors.forEach(vendor => {
                if (vendor.vendor.toString() === vendorId.toString()) {
                    vendor.deliveredInMin = deliveredInMin;
                }
            });

            // Save the updated order
            await order.save();
        }

        // Extract customer ID from the order - SAFETY CHECK
        if (order.customer && order.customer._id) {
            const customerId = order.customer._id;

            // Retrieve the customer from database to get FCM token
            const customer = await Customer.findById(customerId);
            if (customer && customer.fcmDeviceToken) {
                const fcmtoken = customer.fcmDeviceToken;

                const title = 'Order Status Updated';
                const body = `The status of your order ${orderId} has been updated to ${newStatus}.`;
                try {
                    // Assuming you have a function or service to send push notifications
                    let pushNotificationRes = await sendPushNotification(fcmtoken, title, body);
                    console.log("Push notification response:", pushNotificationRes);
                } catch (error) {
                    console.error('Error sending push notification:', error);
                }
            }
        }

        res.json(order);
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};



exports.getOrdersByCustomerAndStatus = async (req, res) => {
    const { customerId } = req.params;
    const { status } = req.query;

    try {
        // Convert customerId to a mongoose ObjectId
        const customerObjectId = new mongoose.Types.ObjectId(customerId);

        // Use aggregation pipeline to filter orders and vendors by status and lookup product details
        const orders = await Order.aggregate([
            {
                $match: {
                    customer: customerObjectId,
                    'vendors.orderStatus': status
                }
            },
            {
                $unwind: '$vendors'
            },
            {
                $unwind: '$vendors.products'
            },
            {
                $match: {
                    'vendors.orderStatus': status
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: 'vendors.products.product',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            {
                $unwind: '$productDetails'
            },
            {
                $group: {
                    _id: '$_id',
                    customer: { $first: '$customer' },
                    shippingAddress: { $first: '$shippingAddress' },
                    createdAt: { $first: '$createdAt' },
                    updatedAt: { $first: '$updatedAt' },
                    vendors: {
                        $push: {
                            vendor: '$vendors.vendor',
                            products: {
                                product: '$productDetails',
                                quantity: '$vendors.products.quantity',
                                price: '$vendors.products.price',
                                discount: '$vendors.products.discount',
                                _id: '$vendors.products._id',
                                totalAmount: '$vendors.products.totalAmount'
                            },
                            orderStatus: '$vendors.orderStatus',
                            _id: '$vendors._id'
                        }
                    }
                }
            },
            {
                $match: {
                    vendors: { $ne: [] } // Ensure there are vendors with the specified status
                }
            }
        ]);

        // Check if orders exist
        if (!orders || orders.length === 0) {
            return res.status(404).json({ success: false, message: 'No orders found for the specified customer and status' });
        }

        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.getOrdersByCustomerId = async (req, res) => {
    try {
        const customerId = req.params.customerId;
        const orders = await Order.find({
            customer: customerId,
            'vendors.orderStatus': { $nin: ['Delivered', 'Cancelled'] }
        })
            .populate('customer')
            .populate('vendors.vendor')
            .populate({
                path: 'vendors.products.product',
                populate: {
                    path: 'variations'
                }
            })
            .sort({ createdAt: -1 }) // Sort by createdAt in descending order (latest to oldest)
            .exec();

        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getOrdersHistoryByCustomerId = async (req, res) => {
    try {
        const customerId = req.params.customerId;
        const orders = await Order.find({
            customer: customerId,
            'vendors.orderStatus': { $in: ['Delivered', 'Cancelled'] }
        })
            .populate('customer')
            .populate('vendors.vendor')
            .populate({
                path: 'vendors.products.product',
                populate: {
                    path: 'variations'
                }
            })
            .sort({ createdAt: -1 }) // Sort by createdAt in descending order (latest to oldest)
            .exec();

        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};



exports.markOrderViewed = async (req, res) => {
    console.log("markOrderViewed is called")
    try {
        const vendorId = req.params.vendorId;

        // Update only the orders for the given vendor to set is_new to false
        await Order.updateMany(
            { "vendors.vendor": vendorId, is_new: true },
            { $set: { is_new: false } }
        );

        res.status(200).json({ message: 'Vendor-specific orders marked as viewed' });
    } catch (error) {
        res.status(500).json({ message: 'An error occurred while marking orders as viewed', error: error.message });
    }
};



// Controller to get all unaccepted orders with populated customer details
exports.getUnacceptedOrders = async (req, res) => {
    try {
        // Find all orders where acceptedBy is null or undefined
        const unacceptedOrders = await Order.find({
            acceptedBy: { $exists: false }
        })
            .select('orderId customer vendors shippingAddress createdAt')
            .populate({
                path: 'customer',
                select: 'name contactNumber image' // Select relevant customer details to return
            });

        // Send the found orders as a response
        res.status(200).json({
            success: true,
            orders: unacceptedOrders
        });
    } catch (error) {
        console.error("Error fetching unaccepted orders:", error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};




exports.handleOrderOfferResponse = async (req, res) => {
    try {
        const { action, orderId, currentLocation } = req.body;
        const { deliveryManId } = req.params;

        if (action === 'reject') {
            const query = mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId: orderId };
            const order = await Order.findOne(query);
            if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

            const OrderAssignment = require('../Driver/orderAssignment.model');
            const assignment = await OrderAssignment.findOneAndUpdate(
                { orderId: order._id, driverId: deliveryManId },
                { status: 'rejected' },
                { new: true }
            );
            if (!assignment) return res.status(404).json({ success: false, message: 'Offer not found' });
            return res.status(200).json({ success: true, message: 'Rejected' });
        }

        console.log("orderId==>", orderId);

        // Find the order first to get vendor and customer locations
        // Flexibly handle both MongoDB _id and custom 6-digit orderId
        const query = mongoose.Types.ObjectId.isValid(orderId)
            ? { _id: orderId }
            : { orderId: orderId };

        const order = await Order.findOne(query)
            .populate('customer', 'name contactNumber')
            .populate('vendors.vendor', 'location');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Calculate driver delivery fee
        let driverDeliveryFee = null;
        let finalLocation = currentLocation;

        // If currentLocation is missing or 0,0, try to get from Driver DB
        if (!finalLocation || !finalLocation.latitude || finalLocation.latitude === 0) {
            const currentDriver = await Driver.findById(deliveryManId);
            if (currentDriver && currentDriver.currentLocation?.coordinates) {
                finalLocation = {
                    latitude: currentDriver.currentLocation.coordinates[1],
                    longitude: currentDriver.currentLocation.coordinates[0]
                };
            }
        }

        if (finalLocation && finalLocation.latitude && finalLocation.latitude !== 0) {
            // Fetch settings for driver delivery fee configuration
            const Settings = require('../Settings/model');
            let settings = await Settings.findOne();

            if (!settings) {
                settings = await Settings.create({ vendorVisibilityRadius: 10 });
            }

            // Get pickup location (first vendor's location)
            const firstVendor = order.vendors[0]?.vendor;
            if (firstVendor && firstVendor.location && firstVendor.location.coordinates) {
                const pickupGeo = {
                    latitude: firstVendor.location.coordinates[1],
                    longitude: firstVendor.location.coordinates[0]
                };

                // Get drop location (customer's shipping address)
                const dropGeo = {
                    latitude: order.shippingAddress.latitude,
                    longitude: order.shippingAddress.longitude
                };

                // Calculate driver delivery fee
                const { calculateDriverDeliveryFee } = require('../Driver/pricingUtil');
                driverDeliveryFee = calculateDriverDeliveryFee(
                    finalLocation,
                    pickupGeo,
                    dropGeo,
                    settings
                );
                driverDeliveryFee.calculatedAt = new Date();
            }
        }

        // Generate 4-digit Pickup OTP
        const pickupOtp = Math.floor(1000 + Math.random() * 9000);

        // Update the order with acceptedBy and driver delivery fee
        const updateQuery = mongoose.Types.ObjectId.isValid(orderId)
            ? { _id: orderId, driverId: null }
            : { orderId: orderId, driverId: null };

        const updatedOrder = await Order.findOneAndUpdate(
            updateQuery,
            {
                acceptedBy: deliveryManId,
                driverId: deliveryManId,
                pickupOtp: pickupOtp,
                is_new: false,
                ...(driverDeliveryFee && { driverDeliveryFee })
            },
            { new: true }
        ).populate('customer', 'name contactNumber');

        // If order is null, it means another driver already accepted
        if (!updatedOrder) {
            return res.status(409).json({
                success: false,
                message: 'Order already accepted by another driver'
            });
        }

        // Link Order to Driver
        await Driver.findByIdAndUpdate(deliveryManId, {
            currentOrderId: updatedOrder._id
        });

        // Clean up OrderAssignments and notify other drivers
        const OrderAssignment = require('../Driver/orderAssignment.model');
        try {
            // Mark this as accepted
            await OrderAssignment.findOneAndUpdate(
                { orderId: updatedOrder._id, driverId: deliveryManId },
                { status: 'accepted' }
            );

            // Find all other drivers who were notified
            const otherAssignments = await OrderAssignment.find({
                orderId: updatedOrder._id,
                driverId: { $ne: deliveryManId },
                status: 'pending'
            });

            // Mark others as expired
            await OrderAssignment.updateMany(
                { orderId: updatedOrder._id, driverId: { $ne: deliveryManId } },
                { status: 'expired' }
            );

            // Notify other drivers real-time
            const io = req.app.get('io');
            if (io) {
                otherAssignments.forEach(assignment => {
                    io.to(assignment.driverId.toString()).emit('order_taken', { orderId: updatedOrder.orderId });
                });
            }

        } catch (err) {
            console.error("OrderAssignment cleanup error:", err);
        }

        // Send back the updated order details
        res.status(200).json({
            success: true,
            message: 'Order accepted successfully',
            order: updatedOrder,
            driverDeliveryFee
        });
    } catch (error) {
        console.error('Accept Order Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};






// Unified delivery charge calculation endpoint
// Supports both old format (vendors + shippingAddress) and new format (3 locations)

exports.getOrderDetailsByVendor = async (req, res) => {
    try {
        const { orderId, vendorId } = req.params;
        const oId = new mongoose.Types.ObjectId(orderId);
        const vId = new mongoose.Types.ObjectId(vendorId);

        const order = await Order.aggregate([
            { $match: { _id: oId } },
            {
                $addFields: {
                    customer: {
                        $cond: {
                            if: { $eq: [{ $type: "$customer" }, "string"] },
                            then: { $toObjectId: "$customer" },
                            else: "$customer"
                        }
                    }
                }
            },
            { $unwind: { path: "$vendors", preserveNullAndEmptyArrays: true } },
            { $match: { "vendors.vendor": vId } },
            {
                $lookup: {
                    from: "customers",
                    localField: "customer",
                    foreignField: "_id",
                    as: "customer"
                }
            },
            { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$vendors.products", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "products",
                    localField: "vendors.products.product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: "$_id",
                    orderId: { $first: "$orderId" },
                    orderStatus: { $first: "$vendors.orderStatus" },
                    createdAt: { $first: "$createdAt" },
                    totalAmount: { $sum: "$vendors.products.totalAmount" },
                    customer: { $first: "$customer" },
                    customerNameFallback: { $first: "$name" },
                    pickupOtp: { $first: "$pickupOtp" },
                    driverId: { $first: "$driverId" },
                    shippingAddress: { $first: "$shippingAddress" },
                    items: {
                        $push: {
                            name: { $ifNull: ["$productDetails.name", "$vendors.products.name"] },
                            price: "$vendors.products.price",
                            quantity: "$vendors.products.quantity"
                        }
                    }
                }
            }
        ]);

        if (!order || order.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        res.status(200).json({ success: true, data: order[0] });
    } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};


exports.seedTestOrder = async (req, res) => {
    try {
        const vendorId = new mongoose.Types.ObjectId('69688356e816bb4201baedc6');

        // Create dummy customer details if needed
        const newOrder = new Order({
            orderId: Math.floor(100000 + Math.random() * 900000).toString(),
            customer: new mongoose.Types.ObjectId(), // Dummy ID
            vendors: [{
                vendor: vendorId,
                orderStatus: "Pending",
                products: [{
                    product: new mongoose.Types.ObjectId(),
                    name: "SevaBazar Special Burger",
                    quantity: 2,
                    price: 250,
                    totalAmount: 500
                }]
            }],
            totalAmount: 500,
            shippingAddress: {
                addressLine1: "45/A Test Building",
                city: "Muzaffarpur",
                state: "Bihar",
                postalCode: "842001"
            },
            paymentStatus: "Unpaid"
        });

        await newOrder.save();
        res.status(201).json({ success: true, message: "Test order seeded successfully!", orderId: newOrder.orderId });
    } catch (error) {
        console.error("Seed error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
