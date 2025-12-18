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
    deliveryChargeConfig: {
      type: [
        {
          conditionType: {
            type: String,
            enum: ["range", "greaterThan", "lessThan"],
            default: "range",
          },
          minDistance: { type: Number, default: 0 },
          maxDistance: { type: Number, default: 0 },
          deliveryFee: { type: Number, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);

module.exports = Settings;
