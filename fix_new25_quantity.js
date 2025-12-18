const mongoose = require('mongoose');
require('dotenv').config();
const { Product, ProductVariation } = require('./src/modules/Product/model');

const uri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}`;

const run = async () => {
    try {
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const productId = '691eab6008da29283f92c6ba'; // new25 ID from debug output
        
        const product = await Product.findById(productId).populate('variations');
        
        if (!product) {
            console.log('Product not found');
            return;
        }

        console.log(`Current Quantity: ${product.quantity}`);
        
        if (product.variations && product.variations.length > 0) {
            console.log('first variation:', JSON.stringify(product.variations[0], null, 2));

            // Force update quantity to 10 for the first variation
            product.variations[0].quantity = 10;
            // We need to save the variation document itself if it's a separate model?
            // Product.variations is ref to ProductVariation.
            // When populated, it's a document.
            // But we can't save the populated document directly from the array usually?
            // Actually, if it's a mongoose document, we can.
            
            const variationDoc = product.variations[0];
            variationDoc.quantity = 10;
            await variationDoc.save();
            console.log('Updated variation quantity to 10.');

            totalQuantity = product.variations.reduce((sum, v) => sum + (v.quantity || 0), 0);
            console.log(`Recalculated Total Quantity: ${totalQuantity}`);
        }

        if (product.quantity !== totalQuantity) {
            console.log(`Updating parent quantity from ${product.quantity} to ${totalQuantity}`);
            product.quantity = totalQuantity;
            await product.save();
            console.log('Product updated successfully.');
        } else {
             // Even if parent matches sum, if both were 0, we now want them to be 10.
             // The logic above updates variation then recalculates sum.
             // So if variation is 10, sum is 10. parent was 0.
             // 0 != 10, so it updates parent.
             console.log('Quantity is already synced.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
