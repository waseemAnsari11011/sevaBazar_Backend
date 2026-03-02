const mongoose = require('mongoose');
require('dotenv').config();

const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

async function checkDrivers() {
    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to DB");
        const doc = await mongoose.connection.db.collection('drivers').findOne({});
        console.log("Check for legacy fields in one document:");
        console.log("walletBalance:", doc.walletBalance);
        console.log("floatingCash:", doc.floatingCash);
        console.log("floatingCashLimit:", doc.floatingCashLimit);
        console.log("isOnline:", doc.isOnline);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDrivers();
