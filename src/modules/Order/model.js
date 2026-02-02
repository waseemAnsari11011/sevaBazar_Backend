const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define the Order Schema
const orderSchema = new Schema({
  orderId: {
    type: String,
    unique: true,
    required: true,
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true,
  },
  name: { type: String },
  vendors: [
    {
      vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vendor",
        required: true,
      },
      products: [
        {
          product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
          },
          name: { type: String },
          variations: {
            type: Array,
          },
          quantity: {
            type: Number,
            required: true,
            min: 1,
          },
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
          totalAmount: {
            type: Number,
            min: 0,
          },
          arrivalAt: {
            type: Date,
          },
        },
      ],
      deliveredInMin: {
        type: Number,
      },
      deliveryCharge: {
        type: Number,
        default: 0,
      },
      distance: {
        type: Number,
      },
      deliveryChargeDescription: {
        type: String,
      },
      shippingFee: {
        type: Number,
        default: 0,
      },
      orderStatus: {
        type: String,
        enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"],
        default: "Pending",
      },
    },
  ],
  shippingFee: {
    type: Number,
    default: 0,
  },
  shippingAddress: mongoose.Schema.Types.Mixed,
  isPaymentVerified: {
    type: Boolean,
    default: false,
  },
  paymentStatus: {
    type: String,
    enum: ["Paid", "Unpaid"],
    default: "Unpaid",
  },
  razorpay_payment_id: {
    type: String,
  },
  razorpay_order_id: {
    type: String,
  },
  razorpay_signature: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Delivery",
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
  },
  pickupOtp: {
    type: Number,
  },
  deliveryOtp: {
    type: Number,
  },
  is_new: {
    type: Boolean,
    default: true,
  },
  driverDeliveryFee: {
    totalDistance: Number,
    currentToPickup: Number,
    pickupToDrop: Number,
    basePay: Number,
    extraDistance: Number,
    extraPay: Number,
    totalFee: Number,
    calculatedAt: Date,
  },
  vendorPaymentStatus: {
    type: String,
    enum: ["Pending", "Paid"],
    default: "Pending",
  },
  driverEarningStatus: {
    type: String,
    enum: ["Pending", "Paid"],
    default: "Pending",
  },
  floatingCashStatus: {
    type: String,
    enum: ["Pending", "Paid"],
    default: "Pending",
  },
  floatingCashAmount: {
    type: Number,
    default: 0,
  },
  deliveredAt: {
    type: Date,
    default: null,
  },
});

// Pre-save middleware to generate a unique 6-digit orderId and calculate the total amount for each product
orderSchema.pre("validate", async function (next) {
  // Generate a unique 6-digit orderId if the document is new
  if (this.isNew) {
    let isUnique = false;

    while (!isUnique) {
      const uniqueId = Math.floor(100000 + Math.random() * 900000).toString();
      const existingOrder = await mongoose.models.Order.findOne({
        orderId: uniqueId,
      });

      if (!existingOrder) {
        this.orderId = uniqueId;
        isUnique = true;
      }
    }
  }

  // Populate product references to get availableLocalities
  await this.populate({
    path: "vendors.products.product",
  });

  // Calculate the total amount for each product and set arrivalAt
  this.vendors.forEach((vendor) => {
    vendor.products.forEach((product) => {
      product.totalAmount =
        (product.price - (product.price * product.discount) / 100) *
        product.quantity;


    });
  });

  next();
});

// Create the Order Model
const Order = mongoose.model("Order", orderSchema);

// Export the Order Model
module.exports = Order;
