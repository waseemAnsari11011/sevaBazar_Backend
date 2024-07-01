const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the Order Schema
const orderSchema = new Schema({
    orderId: {
        type: String,
        unique: true,
        required: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    vendors: [{
        vendor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true
        },
        products: [{
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true
            },
            variations: {
                type: Array,
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            price: {
                type: Number,
                required: true,
                min: 0
            },
            discount: {
                type: Number,
                default: 0,
                min: 0,
                max: 100
            },
            totalAmount: {
                type: Number,
                min: 0
            }
        }],
        orderStatus: {
            type: String,
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
            default: 'Pending'
        }
    }],
    shippingAddress: {
        address: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        country: {
            type: String,
            required: true
        },
        postalCode: {
            type: String,
            required: true
        }
    },
    isPaymentVerified: {
        type: Boolean,
        default: false
    },
    paymentStatus: {
        type: String,
        enum: ['Paid', 'Unpaid'],
        default: 'Unpaid'
    },
    razorpay_payment_id: {
        type: String
    },
    razorpay_order_id: {
        type: String
    },
    razorpay_signature: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    is_new: {
        type: Boolean,
        default: true
    }
});

// Pre-save middleware to generate a unique 6-digit orderId and calculate the total amount for each product
orderSchema.pre('validate', async function (next) {
    // Generate a unique 6-digit orderId if the document is new
    if (this.isNew) {
        let isUnique = false;

        while (!isUnique) {
            const uniqueId = Math.floor(100000 + Math.random() * 900000).toString();
            const existingOrder = await mongoose.models.Order.findOne({ orderId: uniqueId });

            if (!existingOrder) {
                this.orderId = uniqueId;
                isUnique = true;
            }
        }
    }

    // Calculate the total amount for each product
    this.vendors.forEach(vendor => {
        vendor.products.forEach(product => {
            product.totalAmount = (product.price - (product.price * product.discount / 100)) * product.quantity;
        });
    });

    next();
});

// Create the Order Model
const Order = mongoose.model('Order', orderSchema);

// Export the Order Model
module.exports = Order;
