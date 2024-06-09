const Order = require('../Order/model');  // Adjust the path according to your project structure
const Product = require('../Product/model');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');

//razorpay
const razorpay = new Razorpay({
    key_id: 'rzp_test_nEIzO6bfk1HLkL',
    key_secret: 'X9T9NWRdX0xSE9U2O0Kk1sHI'
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
                if (!product.product || !product.quantity || !product.price) {
                    return res.status(400).json({ error: 'Each product must have a product ID, quantity, and price' });
                }
            }
        }

        // Create a new order instance
        const newOrder = new Order({
            customer,
            vendors,
            shippingAddress
        });

        // Save the order to the database
        const savedOrder = await newOrder.save();

        // Calculate total amount for the order
        let totalAmount = 0;
        savedOrder.vendors.forEach(vendor => {
            vendor.products.forEach(product => {
                totalAmount += product.totalAmount;
            });
        });

        // Update product quantities and save the order to the database
        for (const vendor of vendors) {
            for (const productInfo of vendor.products) {
                const product = await Product.findById(productInfo.product);
                if (!product) {
                    throw new Error(`Product with ID ${productInfo.product} not found`);
                }
                if (product.quantity < productInfo.quantity) {
                    throw new Error(`Not enough quantity available for product ${product.name}`);
                }
                product.quantity -= productInfo.quantity;
                await product.save();
            }
        }

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
        console.log("updatePaymentStatus")
        // Extract required fields from the request body
        const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

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
        } else {
            // Update the order status to reflect failed payment
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
                if (!product.product || !product.quantity || !product.price) {
                    return res.status(400).json({ error: 'Each product must have a product ID, quantity, and price' });
                }
            }
        }

        // Create a new order instance
        const newOrder = new Order({
            customer,
            vendors,
            shippingAddress
        });

        // Update product quantities and save the order to the database
        for (const vendor of vendors) {
            for (const productInfo of vendor.products) {
                const product = await Product.findById(productInfo.product);
                if (!product) {
                    throw new Error(`Product with ID ${productInfo.product} not found`);
                }
                if (product.quantity < productInfo.quantity) {
                    throw new Error(`Not enough quantity available for product ${product.name}`);
                }
                product.quantity -= productInfo.quantity;
                await product.save();
            }
        }

        // Save the order to the database
        const savedOrder = await newOrder.save();

        await session.commitTransaction();
        session.endSession();

        res.status(201).json(savedOrder);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("error", error);
        res.status(400).json({ error: error.message });
    }
};


// Controller function to get all orders for a particular vendor

exports.getOrdersByVendor = async (req, res) => {
    try {
        const vendorId = new mongoose.Types.ObjectId(req.params.vendorId);

        const vendorOrders = await Order.aggregate([
            // Unwind the vendors array to work with individual vendor documents
            { $unwind: "$vendors" },
            // Match only those documents where the vendor ID matches
            { $match: { "vendors.vendor": vendorId } },
            // Lookup to join customer details
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
                    localField: "vendors.vendor",
                    foreignField: "_id",
                    as: "vendorDetails"
                }
            },
            // Unwind the vendorDetails array to get the object
            { $unwind: "$vendorDetails" },
            // Unwind the products array to work with individual product documents
            { $unwind: "$vendors.products" },
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
            { $unwind: "$productDetails" },
            // Group back the products and vendors
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
                        razorpay_payment_id: "$razorpay_payment_id"
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
            // Project to reshape the output document
            {
                $project: {
                    _id: 0,
                    orderId: "$_id.orderId",
                    customer: "$_id.customer",
                    shippingAddress: "$_id.shippingAddress",
                    isPaymentVerified: "$_id.isPaymentVerified",
                    paymentStatus: "$_id.paymentStatus",
                    razorpay_payment_id: "$_id.razorpay_payment_id",
                    vendors: {
                        vendor: "$_id.vendor",
                        orderStatus: "$_id.orderStatus",
                        products: "$products"
                    }
                }
            }
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
    const { newStatus } = req.body;

    console.log(orderId, vendorId, newStatus)

    try {
        // Find the order by ID and update the status for the specific vendor
        const order = await Order.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(orderId), 'vendors.vendor': new mongoose.Types.ObjectId(vendorId) },
            { $set: { 'vendors.$.orderStatus': newStatus } },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ error: 'Order or vendor not found' });
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
        const orders = await Order.find({ customer: customerId })
            .populate('customer')
            .populate('vendors.vendor')
            .populate('vendors.products.product')
            .exec();
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};






