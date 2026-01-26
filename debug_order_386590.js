require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const Order = require("./src/modules/Order/model");
const Vendor = require("./src/modules/Vendor/model");

const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

async function debugOrder() {
    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB");

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const orders = await Order.find({ createdAt: { $gte: today } }).populate('vendors.vendor');
        let logOutput = `Found ${orders.length} orders created today.\n\n`;
        orders.forEach(o => {
            logOutput += `CODE: ${o.orderId} | ID: ${o._id} | STATUS: ${o.vendors?.[0]?.orderStatus}\n`;
            logOutput += `ADDR: ${JSON.stringify(o.shippingAddress, null, 2)}\n`;
            logOutput += `-----------------------------------\n`;
        });
        fs.writeFileSync("debug_order_results.txt", logOutput);
        console.log("Logged results to debug_order_results.txt");
        return;

        console.log("Order Found:");
        console.log("  _id:", order._id);
        console.log("  orderId (code):", order.orderId);
        console.log("  Status:", order.vendors[0]?.orderStatus);
        console.log("  Shipping Address:", JSON.stringify(order.shippingAddress, null, 2));

        const vendor = order.vendors[0]?.vendor;
        if (vendor) {
            console.log("Vendor Details:");
            console.log("  Name:", vendor.name);
            console.log("  Location:", JSON.stringify(vendor.location, null, 2));
        } else {
            console.log("No vendor found for this order");
        }

        const OrderAssignment = require("./src/modules/Driver/orderAssignment.model");
        const assignments = await OrderAssignment.find({ orderId: order._id });
        console.log(`Found ${assignments.length} assignments for this order:`);
        assignments.forEach(a => console.log(`  Driver: ${a.driverId}, Status: ${a.status}`));

    } catch (err) {
        console.error("Debug Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

debugOrder();
