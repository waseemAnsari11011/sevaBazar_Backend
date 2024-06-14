// Import mongoose
const mongoose = require('mongoose');

// Define the Banner Schema
const bannerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    images: {
        type: [String],  // Array of strings to store image URLs or paths
        validate: [arrayLimit, '{PATH} exceeds the limit of 10'] // Optional: Limit the number of images
    },
    isActive: { type: Boolean, default: false }

}, {
    timestamps: true // Automatically add createdAt and updatedAt timestamps
});

// Custom validator to limit array size
function arrayLimit(val) {
    return val.length <= 10;
}

// Create the Banner Model
const Banner = mongoose.model('Banner', bannerSchema);

// Export the Banner Model
module.exports = Banner;
