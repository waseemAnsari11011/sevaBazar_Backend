const mongoose = require('mongoose');
require('dotenv').config();
const { Product } = require('./src/modules/Product/model');

const uri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}`;

const run = async () => {
    try {
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const names = ['new25', 'prod 2', 'prod 3'];
        const regexNames = names.map(n => new RegExp(n, 'i'));

        // Also try to find by exact name content if regex fails or too broad
        // The user sees "new25" in one place and "new_25_prod_..." descriptions maybe?
        // Let's print all names of matches.
        
        const products = await Product.find({ name: { $in: regexNames } });

        console.log('Found products:', products.length);
        products.forEach(p => {
            console.log('------------------------------------------------');
            console.log(`Name: ${p.name}`);
            console.log(`ID: ${p._id}`);
            console.log(`Vendor: ${p.vendor}`);
            console.log(`Category: ${p.category}`);
            console.log(`Quantity (Parent): ${p.quantity}`);
            console.log(`IsVisible: ${p.isVisible}`);
            console.log(`IsDeleted: ${p.isDeleted}`);
            // Check variations
             if (p.variations && p.variations.length > 0) {
                 console.log(`Variations Count: ${p.variations.length}`);
                 // Note: variations are ObjectIds unless populated. 
                 // We didn't populate them here, but we can query them if needed.
             }
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
