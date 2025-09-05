const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");

// Define the schema
const vendorSchema = new Schema({
  name: {
    type: String,
  },
  password: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  vendorInfo: {
    businessName: {
      type: String,
    },
    contactNumber: {
      type: String,
      required: true,
    },
    alternativeContactNumber: {
      type: String,
      required: true,
    },
    address: {
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
      },
    },
  },

  // 👇 New fields for Dukaan visibility
  isOnline: {
    type: Boolean,
    default: true, // by default dukaan is online
  },
  status: {
    type: String,
    enum: ["online", "offline"],
    default: "online",
  },

  // 👇 New field for location-based listing
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: "2dsphere", // for geospatial queries
    },
  },

  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },

  role: {
    type: String,
    default: "vendor",
  },
  isRestricted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Method to compare passwords
vendorSchema.methods.comparePassword = async function (candidatePassword) {
  // console.log("candidatePassword", candidatePassword)
  return bcrypt.compare(candidatePassword, this.password);
};

// Create the model
const Vendor = mongoose.model("Vendor", vendorSchema);

module.exports = Vendor;
