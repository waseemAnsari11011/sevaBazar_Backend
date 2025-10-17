const mongoose = require("mongoose");

// =================================================================
// 1. Define the Product Variation Schema (Separate Collection)
// =================================================================
const productVariationSchema = new mongoose.Schema({
  // Reference to the parent product document.
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  // UPDATED: Changed from a Map to an Array of Objects
  attributes: [
    {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      value: {
        type: String,
        required: true,
        trim: true,
      },
    },
  ],
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  quantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  images: {
    type: [String],
    default: [],
  },
});

// =================================================================
// 2. Define the Main Product Schema
// =================================================================
const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        required: true,
      },
    ],
    isReturnAllowed: {
      type: Boolean,
      required: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    variations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProductVariation",
      },
    ],
    arrivalDuration: {
      type: String,
    },
  },
  {
    timestamps: true, // Manages createdAt and updatedAt fields
  }
);

// =================================================================
// 3. Create and Export the Models
// =================================================================
const ProductVariation = mongoose.model(
  "ProductVariation",
  productVariationSchema
);
const Product = mongoose.model("Product", productSchema);

module.exports = { Product, ProductVariation };
