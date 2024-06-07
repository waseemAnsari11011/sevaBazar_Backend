const Order = require('../Order/model');  // Adjust the path according to your project structure
const Product = require('../Product/model');
const mongoose = require('mongoose');

exports.createOrder = async (req, res) => {
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

        console.log("vendors--->>>", customer,
            vendors,
            shippingAddress)


        // Create a new order instance
        const newOrder = new Order({
            customer,
            vendors,
            shippingAddress
        });

        // Save the order to the database
        const savedOrder = await newOrder.save();

        res.status(201).json(savedOrder);
    } catch (error) {
        console.log("error", error);
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
                        orderStatus: "$vendors.orderStatus"
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






