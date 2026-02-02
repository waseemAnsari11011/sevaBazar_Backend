const mongoose = require('mongoose');
require('dotenv').config();

async function debug() {
    try {
        const url = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
        await mongoose.connect(url);
        const Order = require('./src/modules/Order/model');
        const order = await Order.findOne().sort({ createdAt: -1 });
        if (order && order.vendors && order.vendors[0] && order.vendors[0].products[0]) {
            console.log("Variations in Order Item:");
            console.dir(order.vendors[0].products[0].variations, { depth: null });
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
