const mongoose = require("mongoose");
const { Product } = require("./src/modules/Product/model");
require("dotenv").config();

const run = async () => {
  try {
    const uri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}`;
    await mongoose.connect(uri);
    console.log("Connected to DB");

    const searchQuery = "new25";
    const regexQuery = new RegExp(searchQuery, "i");

    const products = await Product.find({
      $or: [
        { name: { $regex: regexQuery } },
        { description: { $regex: regexQuery } },
        { tags: { $regex: regexQuery } },
      ],
    });

    console.log(`Found ${products.length} products matching '${searchQuery}'`);
    products.forEach(p => {
      console.log("---------------------------------------------------");
      console.log(`ID: ${p._id}`);
      console.log(`Name: ${p.name}`);
      console.log(`IsVisible: ${p.isVisible}`);
      console.log(`IsDeleted: ${p.isDeleted}`);
      console.log(`Quantity: ${p.quantity}`);
      console.log(`Vendor: ${p.vendor}`);
      console.log(`Images: ${JSON.stringify(p.images)}`);
      console.log(`AvailableLocalities: ${p.availableLocalities}`); // Check if field still exists in doc
    });

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
  }
};

run();
