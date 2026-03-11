const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
    await mongoose.connect(mongoUri);

    const driverController = require('./src/modules/Driver/controller');

    // Mock req and res
    const mockReq = {
        body: {
            orderId: "598530",
            vendorId: "679f223126dd001929007f9c", // Example vendor ID from logs
            radius: 50
        },
        app: {
            get: (key) => {
                if (key === 'io') return { to: (id) => ({ emit: (ev, data) => console.log(`[MOCK IO] Emitted ${ev} to ${id}`) }) };
                return null;
            }
        }
    };

    // Need to resolve the real vendorId for 598530
    const Order = require('./src/modules/Order/model');
    const ChatOrder = require('./src/modules/ChatOrdrer/model');
    let order = await Order.findOne({ orderId: "598530" });
    if (!order) order = await ChatOrder.findOne({ orderId: "598530" });

    if (!order) {
        console.log("Order 598530 not found in DB");
        process.exit(1);
    }

    const vendorId = order.vendor || order.vendors[0].vendor;
    mockReq.body.vendorId = vendorId.toString();

    console.log(`\nSimulating findNearestDrivers for Order: ${order.orderId} | Vendor: ${vendorId}`);

    const mockRes = {
        status: (code) => ({
            json: (data) => console.log(`[MOCK RES] Status: ${code} | Data: ${JSON.stringify(data).substring(0, 100)}...`)
        })
    };

    await driverController.findNearestDrivers(mockReq, mockRes);

    process.exit(0);
}

run();
