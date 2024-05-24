const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt = require('bcrypt');

// Define the schema
const vendorSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  vendorInfo: {
    businessName: {
      type: String,
      required: true
    },
    contactNumber: {
      type: String,
      required: true
    },
    address: {
      addressLine1: {
        type: String,
        required: true
      },
      addressLine2: String,
      city: {
        type: String,
        required: true
      },
      state: {
        type: String,
        required: true
      },
      country: {
        type: String,
        required: true
      },
      postalCode: {
        type: String,
        required: true
      }
    }
  },
  availableLocalities: [{
    type: String,
    required: true
  }],
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
vendorSchema.methods.comparePassword = async function(candidatePassword) {
  console.log("candidatePassword", candidatePassword)
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Create the model
const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;
