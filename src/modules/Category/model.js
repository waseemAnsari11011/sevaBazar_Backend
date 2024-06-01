// Import mongoose
const mongoose = require('mongoose');

// Define the Category Schema
const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    images: {
        type: [String],  // Array of strings to store image URLs or paths
        validate: [arrayLimit, '{PATH} exceeds the limit of 10'] // Optional: Limit the number of images
    },

}, {
    timestamps: true // Automatically add createdAt and updatedAt timestamps
});

// Custom validator to limit array size
function arrayLimit(val) {
    return val.length <= 10;
}

// Create the Category Model
const Category = mongoose.model('Category', categorySchema);

// Export the Category Model
module.exports = Category;
