const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the schema
const deliverySchema = new Schema({
  name: {
    type: String,
  },
  image: {
    type: String,
  },
  contactNumber: {
    type: String,
    required: true
  },

  role: {
    type: String,
    default: 'delivery man'
  },
  address: {
    type: String,
  },
  vehicleDetails:{
    type: String,
  },

  fcmDeviceToken: {
    type: String,
  },
  isRestricted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});


// Create the model
const Delivery = mongoose.model('Delivery', deliverySchema);

module.exports = Delivery;
//