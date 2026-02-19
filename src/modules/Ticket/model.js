const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
  },
  userType: {
    type: String,
    enum: ['Customer', 'Vendor', 'Driver'],
    required: true,
    default: 'Customer'
  },
  status: {
    type: String,
    enum: ['Open', 'Resolved'],
    default: 'Open',
  },
  reason: {
    type: String,
    default: 'Help Needed',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Ticket', ticketSchema);
