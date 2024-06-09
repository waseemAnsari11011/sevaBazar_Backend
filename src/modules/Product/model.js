// model.js
const mongoose = require('mongoose');

// Define the Product Schema
const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    images: {
        type: [String],  // Array of strings to store image URLs or paths
        validate: [arrayLimit, '{PATH} exceeds the limit of 10'] // Optional: Limit the number of images
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
        max: 100  // Assuming discount is a percentage
    },
    quantity: {
        type: Number,
        default: 0,
    },
    description: {
        type: String,
        trim: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
        required: true
    },
    availableLocalities: [{
        type: String,
        required: true
    }],
}, {
    timestamps: true // Automatically add createdAt and updatedAt timestamps
});

// Custom validator to limit array size
function arrayLimit(val) {
    return val.length <= 10;
}

// Create the Product Model
const Product = mongoose.model('Product', productSchema);

// Export the Product Model
module.exports = Product;
