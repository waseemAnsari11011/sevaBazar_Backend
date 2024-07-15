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
        default: 0,
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
    images: {
        type: [String], // Assuming images are stored as URLs or paths
        default: [] // Initialize with an empty array
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
    tags: [{
        type: String,
        required: true
    }],
    isReturnAllowed: {
        type: Boolean,
        required: true
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
   arrivalDuration:{
    type: String,
   }
}, {
    timestamps: true
});

// Custom validator to limit array size
function arrayLimit(val) {
    return val.length <= 10;
}

productSchema.pre('validate', async function (next) {
    const product = this;

    const containsNumber = product.availableLocalities.some(loc => /\d/.test(loc));
    const containsAll = product.availableLocalities.includes('all');

    if (containsAll && !containsNumber) {
        product.arrivalDuration = '4 Days'
    } else if (containsNumber) {
        product.arrivalDuration = '90 Min'
    }

    next();
});



// Create the Product Model
const Product = mongoose.model('Product', productSchema);

// Export the Product Model
module.exports = Product;
