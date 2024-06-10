const mongoose = require('mongoose');

// Define the FAQ schema
const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
  },
  answer: {
    type: String,
    required: true,
    trim: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Middleware to update the updated_at field on save
faqSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

// Create the FAQ model
const FAQ = mongoose.model('FAQ', faqSchema);

module.exports = FAQ;
