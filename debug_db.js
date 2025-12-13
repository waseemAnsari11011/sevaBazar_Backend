require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('./src/modules/Product/model');

const uri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}`;

async function run() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to DB');

    const allCount = await Product.countDocuments({});
    console.log('Total Products:', allCount);

    const offeredCount = await Product.countDocuments({ isOffered: true });
    console.log('Offered Products:', offeredCount);

    const offeredProduct = await Product.findOne({ isOffered: true });
    if (offeredProduct) {
      console.log('Sample Offered Product:', JSON.stringify(offeredProduct, null, 2));
    } else {
        console.log('No offered products found.');
    }

    const anyProduct = await Product.findOne({});
    if (anyProduct) {
        console.log('Sample Any Product:', JSON.stringify(anyProduct, null, 2));
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
