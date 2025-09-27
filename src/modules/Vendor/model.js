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
    index: true,
  },
  vendorInfo: {
    businessName: {
      type: String,
    },
    contactNumber: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    alternativeContactNumber: {
      type: String,
    },
  },

  // Image uploads
  documents: {
    shopPhoto: [
      {
        type: String, // S3 URL
      },
    ],
    selfiePhoto: {
      type: String, // S3 URL
      required: true,
    },
    aadharFrontDocument: {
      type: String, // S3 URL
    },
    aadharBackDocument: {
      type: String, // S3 URL
    },
    panCardDocument: {
      type: String, //S3 URL
    },
  },
  bankDetails: {
    accountHolderName: {
      type: String,
    },
    accountNumber: {
      type: String,
    },
    ifscCode: {
      type: String,
    },
    bankName: {
      type: String,
    },
  },
  upiDetails: {
    upiId: {
      type: String,
    },
    upiPhoneNumber: {
      type: String,
    },
    qrCode: {
      type: String, // S3 URL for the QR code image
    },
  },
  isOnline: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ["online", "offline"],
    default: "online",
  },

  // 👇 Location object now contains both the address and coordinates
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: "2dsphere",
    },
    address: {
      addressLine1: {
        type: String,
      },
      addressLine2: String,
      landmark: String, // Add landmark field
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
      postalCodes: {
        // Add this field
        type: [String],
      },
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
  return bcrypt.compare(candidatePassword, this.password);
};

// Create the model
const Vendor = mongoose.model("Vendor", vendorSchema);

module.exports = Vendor;
