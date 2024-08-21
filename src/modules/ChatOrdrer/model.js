const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderSchema = new Schema({
    orderId: {
        type: String,
        unique: true,
        required: true
    },
    orderMessage: {
        type: String,
        required: true
    },
    products: [{
        name: { type: String },
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
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
    },
    name: { type: String },
    shippingAddress: {type: mongoose.Schema.Types.Mixed},
    paymentStatus: {
        type: String,
        enum: ['Paid', 'Unpaid'],
        default: 'Unpaid'
    },
    deliveredInMin:{
        type: Number,
    },
    orderStatus: {
        type: String,
        enum: ['In Review', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'In Review'
    },
    is_new: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    totalAmount: {
        type: Number,
    },
    arrivalAt: {
        type: Date,
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
        required: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    isPaymentVerified: {
        type: Boolean,
        default: false
    },
});

// Middleware to generate unique orderId and set the vendor to admin
orderSchema.pre('validate', async function (next) {
    if (this.isNew) {
        // Generate a unique 6-digit orderId
        let isUnique = false;

        while (!isUnique) {
            const uniqueId = Math.floor(100000 + Math.random() * 900000).toString();
            const existingOrder = await mongoose.models.ChatOrder.findOne({ orderId: uniqueId });

            if (!existingOrder) {
                this.orderId = uniqueId;
                isUnique = true;
            }
        }

        // Find the admin vendor
        const adminVendor = await mongoose.models.Vendor.findOne({ role: 'admin' });
        if (!adminVendor) {
            return next(new Error('Admin vendor not found'));
        }

        // Set the vendor to admin
        this.vendor = adminVendor._id;
    }

    this.arrivalAt = new Date(Date.now() + 90 * 60 * 1000);

    next();
});

const ChatOrder = mongoose.model('ChatOrder', orderSchema);

module.exports = ChatOrder;
