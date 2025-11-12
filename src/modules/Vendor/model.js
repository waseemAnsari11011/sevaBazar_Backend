const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");
const crypto = require("crypto"); // Import built-in crypto module

// Define the schema
const vendorSchema = new Schema({
  // --- Custom, human-readable ID ---
  vendorId: {
    type: String,
    unique: true,
    index: true,
  },

  // --- Basic Info ---
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

  // --- Image/Document Uploads ---
  documents: {
    shopPhoto: [
      {
        type: String, // S3 URL
      },
    ],
    shopVideo: [
      {
        type: String, // S3 URL for the video
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
    gstCertificate: {
      type: String, // S3 URL for the PDF/image
    },
    fssaiCertificate: {
      type: String, // S3 URL for the certificate
    },
  },

  // --- Payment Details ---
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

  // --- Status & Location ---
  isOnline: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ["online", "offline"],
    default: "online",
  },
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
      landmark: String,
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
        type: [String],
      },
    },
  },

  // --- Other Fields ---
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

  // --- Password Reset ---
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },

  // --- Timestamps ---
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// --- 👇 AUTOMATION LOGIC (PRE-SAVE HOOK) ---

// Mongoose 'pre-save' hook to run logic before saving
vendorSchema.pre("save", async function (next) {
  // 'this' refers to the document being saved

  // 1. Generate custom vendorId only for new documents
  if (this.isNew) {
    // Generate 4 random bytes, which gives an 8-character hex string
    const randomId = crypto.randomBytes(4).toString("hex");
    this.vendorId = `VND-${randomId}`; // e.g., "VND-1a2b3c4d"
  }

  // 2. Hash the password if it's new or modified
  if (this.isModified("password") || this.isNew) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error); // Pass error to the save operation
    }
  }

  // 3. Update the 'updatedAt' timestamp
  this.updatedAt = Date.now();

  next(); // Continue with the save operation
});

// --- End of Automation Logic ---

// Method to compare passwords
vendorSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Create the model
const Vendor = mongoose.model("Vendor", vendorSchema);

module.exports = Vendor;
