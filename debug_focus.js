const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
    await mongoose.connect(mongoUri);

    const Order = require('./src/modules/Order/model');
    const ChatOrder = require('./src/modules/ChatOrdrer/model');
    const Driver = require('./src/modules/Driver/model');
    const Vendor = require('./src/modules/Vendor/model');

    let order = await Order.findOne({ orderId: "598530" });
    let isChat = false;
    if (!order) {
        order = await ChatOrder.findOne({ orderId: "598530" });
        isChat = true;
    }

    if (!order) {
        console.log("Order 598530 not found");
        process.exit(0);
    }

    console.log(`Order Found: ${order.orderId} | Status: ${isChat ? order.orderStatus : order.vendors[0].orderStatus} | isDriverRequested: ${order.isDriverRequested}`);

    const vendorId = isChat ? order.vendor : order.vendors[0].vendor;
    const vendor = await Vendor.findById(vendorId);
    console.log(`Vendor: ${vendor.name} | Location: ${JSON.stringify(vendor.location?.coordinates)}`);

    const freeDrivers = await Driver.find({
        isOnline: true,
        isBlocked: false,
        currentOrderId: null,
        approvalStatus: 'approved'
    });

    console.log(`\nTesting $geoNear for Order: ${order.orderId}`);
    const searchLon = vendor.location.coordinates[0];
    const searchLat = vendor.location.coordinates[1];
    const radiusInMeters = 50 * 1000; // 50km

    const driversNear = await Driver.aggregate([
        {
            $geoNear: {
                near: {
                    type: "Point",
                    coordinates: [parseFloat(searchLon), parseFloat(searchLat)],
                },
                distanceField: "distanceFromVendor",
                maxDistance: radiusInMeters,
                query: {
                    approvalStatus: "approved",
                    isOnline: true,
                    isBlocked: false,
                    currentOrderId: null,
                },
                spherical: true,
            },
        }
    ]);

    console.log(`$geoNear Results Count: ${driversNear.length}`);
    for (const d of driversNear) {
        console.log(` - Driver: ${d.personalDetails.name} | Distance: ${(d.distanceFromVendor / 1000).toFixed(2)} km`);
    }

    process.exit(0);
}

run();
