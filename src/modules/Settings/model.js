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
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);

module.exports = Settings;
