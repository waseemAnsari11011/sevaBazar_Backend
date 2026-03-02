const { MongoClient } = require('mongodb');
require('dotenv').config();

const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

async function cleanRaw() {
    const client = new MongoClient(mongoUri);
    try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('drivers');

        console.log("Connected to Raw MongoDB");

        const result = await collection.updateMany(
            {},
            {
                $unset: {
                    walletBalance: "",
                    floatingCash: "",
                    floatingCashLimit: "",
                    // Add any other variants if they exist
                    "walletBalance": 1,
                    "floatingCash": 1,
                    "floatingCashLimit": 1
                }
            }
        );

        console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

        // Final check
        const doc = await collection.findOne({});
        console.log("Sample Document after unset:");
        console.log("Fields present:", Object.keys(doc).filter(k => ['walletBalance', 'floatingCash', 'floatingCashLimit'].includes(k)));

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
        process.exit(0);
    }
}

cleanRaw();
