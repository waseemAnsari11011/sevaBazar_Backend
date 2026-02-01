const mongoose = require('mongoose');
const Order = require('./src/modules/Order/model');

async function simulate() {
    try {
        await mongoose.connect('mongodb://localhost:27017/sevabazar'); // Adjust if needed
        console.log('Connected to DB');

        // Find a recent order for a test driver
        // Adjust driverId to match your test driver
        const driverId = '679c8f2f2f7f7f7f7f7f7f7f'; // Placeholder, replace with actual

        const order = await Order.findOne({ driverId: driverId, orderStatus: 'Delivered' });

        if (order) {
            console.log(`Updating Order ${order.orderId} to be 24 hours old...`);
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            order.deliveredAt = yesterday;
            order.floatingCashStatus = 'Pending';
            await order.save();
            console.log('Update successful! Driver should now be blocked.');
        } else {
            console.log('No delivered order found for this driver.');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

simulate();
