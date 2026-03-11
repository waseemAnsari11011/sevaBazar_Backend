const mongoose = require('mongoose');
require('dotenv').config();

async function debug() {
    try {
        const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
        console.log("Connecting to:", `mongodb+srv://${process.env.MONGO_HOST}/${process.env.DB_NAME}`);
        await mongoose.connect(mongoUri);
        console.log("Connected to DB");

        const Order = require('./src/modules/Order/model');
        const ChatOrder = require('./src/modules/ChatOrdrer/model');
        const Driver = require('./src/modules/Driver/model');

        const pendingRegular = await Order.find({
            driverId: null,
            'vendors.orderStatus': 'Processing'
        });
        console.log("Pending Regular Orders:", pendingRegular.length);
        const Vendor = require('./src/modules/Vendor/model');
        for (const o of pendingRegular) {
            const vId = o.vendors[0]?.vendor;
            const vendor = await Vendor.findById(vId);
            console.log(` - Regular Order: ${o.orderId}, isDriverRequested: ${o.isDriverRequested}, Vendor Loc: ${JSON.stringify(vendor?.location?.coordinates)}`);
        }

        const specificOrder = await Order.findOne({ orderId: "598530" });
        if (specificOrder) {
            console.log("\n--- Specific Order 598530 ---");
            console.log(`Status: ${specificOrder.orderStatus || specificOrder.vendors[0]?.orderStatus}`);
            console.log(`isDriverRequested: ${specificOrder.isDriverRequested}`);
            console.log(`driverId: ${specificOrder.driverId}`);
            const vId = specificOrder.vendors[0]?.vendor;
            const vendor = await Vendor.findById(vId);
            console.log(`Vendor Location: ${JSON.stringify(vendor?.location?.coordinates)}`);
        } else {
            const specificChatOrder = await ChatOrder.findOne({ orderId: "598530" });
            if (specificChatOrder) {
                console.log("\n--- Specific Chat Order 598530 ---");
                console.log(`Status: ${specificChatOrder.orderStatus}`);
                console.log(`isDriverRequested: ${specificChatOrder.isDriverRequested}`);
                console.log(`driverId: ${specificChatOrder.driverId}`);
                const vendor = await Vendor.findById(specificChatOrder.vendor);
                console.log(`Vendor Location: ${JSON.stringify(vendor?.location?.coordinates)}`);
            }
        }

        const pendingChat = await ChatOrder.find({
            driverId: null,
            orderStatus: 'Processing'
        });
        console.log("\nPending Chat Orders:", pendingChat.length);
        for (const o of pendingChat) {
            const vendor = await Vendor.findById(o.vendor);
            console.log(` - Chat Order: ${o.orderId}, isDriverRequested: ${o.isDriverRequested}, Vendor Loc: ${JSON.stringify(vendor?.location?.coordinates)}`);
        }

        const freeDrivers = await Driver.find({
            currentOrderId: null,
            isOnline: true,
            isBlocked: false,
            approvalStatus: 'approved'
        });
        console.log("Free Online Drivers:", freeDrivers.length);
        freeDrivers.forEach(d => console.log(` - Name: ${d.personalDetails.name}, Loc: ${JSON.stringify(d.currentLocation.coordinates)}`));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
