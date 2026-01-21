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
    // Unified pricing configuration used for both customer delivery and driver payment
    driverDeliveryFee: {
      basePay: {
        type: Number,
        default: 30, // ₹30 for first 5 km
      },
      baseDistance: {
        type: Number,
        default: 5, // km covered by base pay
      },
      perKmRate: {
        type: Number,
        default: 10, // ₹10 per km beyond base distance
      },
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);

module.exports = Settings;
