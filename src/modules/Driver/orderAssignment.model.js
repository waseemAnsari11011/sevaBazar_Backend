const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const orderAssignmentSchema = new Schema({
    orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        required: true,
    },
    driverId: {
        type: Schema.Types.ObjectId,
        ref: "Driver",
        required: true,
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "expired"],
        default: "pending",
    },
    distance: {
        type: Number, // Distance from driver to pickup
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

// Compound index to quickly find offers for a specific driver
orderAssignmentSchema.index({ driverId: 1, status: 1 });
// TTL index to automatically remove old offers (e.g., after 5 minutes)
orderAssignmentSchema.index({ createdAt: 1 }, { expireAfterSeconds: 300 });

module.exports = mongoose.model("OrderAssignment", orderAssignmentSchema);
