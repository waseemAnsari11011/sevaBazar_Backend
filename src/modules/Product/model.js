const mongoose = require('mongoose');

// Define the Variation Schema
const variationSchema = new mongoose.Schema({
    attributes: {
        type: Map,
        of: String,
        required: true
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
    quantity: {
        type: Number,
        default: 0,
        min: 0
    },
    parentVariation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product.variations',
        default: null
    }
});

// Define the Product Schema
const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    images: {
        type: [String],
        validate: [arrayLimit, '{PATH} exceeds the limit of 10']
    },
    variations: [variationSchema],
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
    quantity: {
        type: Number,
        default: 0,
        min: 0
    },
    availableLocalities: [{
        type: String,
        required: true
    }],
}, {
    timestamps: true
});

// Custom validator to limit array size
function arrayLimit(val) {
    return val.length <= 10;
}

// Create the Product Model
const Product = mongoose.model('Product', productSchema);

// Export the Product Model
module.exports = Product;
