const mongoose = require("mongoose");

/**
 * @swagger
 * components:
 * schemas:
 * Settings:
 * type: object
 * required:
 * - vendorVisibilityRadius
 * properties:
 * vendorVisibilityRadius:
 * type: number
 * description: The maximum distance in kilometers for customers to see vendors.
 * default: 10
 * example:
 * vendorVisibilityRadius: 15
 */
const settingsSchema = new mongoose.Schema(
  {
    vendorVisibilityRadius: {
      type: Number,
      required: true,
      default: 10, // Default distance in kilometers
    },
    driverSearchRadius: {
      type: Number,
      default: 5, // Default search radius in kilometers
    },
    driverPayoutMode: {
      type: String,
      enum: ["tiered", "formula"],
      default: "tiered", // 'tiered' uses ranges, 'formula' uses Base + Per Km
    },
    // Formula-based driver payout config
    driverDeliveryFee: {
      basePay: {
        type: Number,
        default: 30,
      },
      baseDistance: {
        type: Number,
        default: 5,
      },
      perKmRate: {
        type: Number,
        default: 10,
      },
    },
    // Tiered delivery charge configuration (for Customers)
    deliveryChargeConfig: [
      {
        conditionType: {
          type: String,
          enum: ["range", "greaterThan", "lessThan"],
          default: "range",
        },
        minDistance: {
          type: Number,
          default: 0,
        },
        maxDistance: {
          type: Number,
          default: 0,
        },
        deliveryFee: {
          type: Number,
          required: true,
        },
      },
    ],
    // Tiered driver payout configuration (for Drivers)
    driverPaymentConfig: [
      {
        conditionType: {
          type: String,
          enum: ["range", "greaterThan", "lessThan"],
          default: "range",
        },
        minDistance: {
          type: Number,
          default: 0,
        },
        maxDistance: {
          type: Number,
          default: 0,
        },
        deliveryFee: {
          type: Number,
          required: true,
        },
      },
    ],
  },
  { timestamps: true, strict: false }
);

const Settings = mongoose.model("Settings", settingsSchema);

module.exports = Settings;
