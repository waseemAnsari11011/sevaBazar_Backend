const mongoose = require('mongoose');
require('dotenv').config();
const Order = require('./src/modules/Order/model');
const Vendor = require('./src/modules/Vendor/model');

const DB_URI = "mongodb+srv://habibihunter78677_db_user:K7z607H5IeK4t7K8@cluster0.c7d67ob.mongodb.net/sevabazar_test?retryWrites=true&w=majority";

async function seedOrder() {
    try {
        await mongoose.connect(DB_URI);
        console.log('Connected to MongoDB');

        // 1. Create a dummy customer
        const customer = await mongoose.connection.collection('customers').insertOne({
            name: "Test Customer",
            phone: "9999988888",
            createdAt: new Date()
        });
        const customerId = customer.insertedId;

        // 2. Create a dummy product
        const product = await mongoose.connection.collection('products').insertOne({
            name: "Test Burger",
            price: 150,
            vendor: new mongoose.Types.ObjectId('69688356e816bb4201baedc6')
        });

        // 3. Create a dummy order
        const orderId = Math.floor(100000 + Math.random() * 900000).toString();
        const newOrder = new Order({
            orderId: orderId,
            customer: customerId,
            vendors: [{
                vendor: new mongoose.Types.ObjectId('69688356e816bb4201baedc6'),
                orderStatus: "Pending",
                products: [{
                    product: product.insertedId,
                    name: "Test Burger",
                    quantity: 2,
                    price: 150,
                    totalAmount: 300
                }]
            }],
            totalAmount: 300,
            shippingAddress: {
                addressLine1: "123 Test Street",
                city: "Muzaffarpur",
                state: "Bihar",
                postalCode: "842001"
            },
            paymentStatus: "Unpaid"
        });

        await newOrder.save();
        console.log('✅ Test order created successfully! OrderID:', orderId);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

seedOrder();
