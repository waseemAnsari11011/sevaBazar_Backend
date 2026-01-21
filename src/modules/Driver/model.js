const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");

const driverSchema = new Schema({
    personalDetails: {
        name: {
            type: String,
            required: true,
        },
        phone: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        password: {
            type: String,
            required: true,
        },
    },
    vehicleDetails: {
        plateNumber: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ["scooter", "bike"],
            required: true,
        },
    },
    documents: [
        {
            type: String, // S3/Firebase image URLs
        },
    ],
    approvalStatus: {
        type: String,
        enum: ["approved", "suspended"],
        default: "approved",
    },
    walletBalance: {
        type: Number,
        default: 0,
    },
    isOnline: {
        type: Boolean,
        default: false,
    },
    currentLocation: {
        type: {
            type: String,
            enum: ["Point"],
            default: "Point",
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            default: [0, 0],
        },
    },
    currentOrderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        default: null,
    },
    role: {
        type: String,
        default: "driver",
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

// Index for geospatial queries
driverSchema.index({ currentLocation: "2dsphere" });

// Hash password before saving
driverSchema.pre("save", async function (next) {
    if (this.isModified("personalDetails.password") || this.isNew) {
        try {
            const salt = await bcrypt.genSalt(10);
            this.personalDetails.password = await bcrypt.hash(
                this.personalDetails.password,
                salt
            );
        } catch (error) {
            return next(error);
        }
    }
    this.updatedAt = Date.now();
    next();
});

// Method to compare password
driverSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.personalDetails.password);
};

const Driver = mongoose.model("Driver", driverSchema);

module.exports = Driver;
