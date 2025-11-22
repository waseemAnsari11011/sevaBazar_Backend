const mongoose = require("mongoose");

const vendorProductCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    images: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const VendorProductCategory = mongoose.model(
  "VendorProductCategory",
  vendorProductCategorySchema
);

module.exports = VendorProductCategory;
