const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the schema
const customerSchema = new Schema({
  password: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  contactNumber: {
    type: String,
    required: true
  },
  shippingAddresses: [
    {
      addressLine1: {
        type: String,
      },
      addressLine2: String,
      city: {
        type: String,
      },
      state: {
        type: String,
      },
      country: {
        type: String,
      },
      postalCode: {
        type: String,
      }
    }
  ],
  availableLocalities: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'customer'
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


// Method to compare passwords
customerSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Create the model
const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
