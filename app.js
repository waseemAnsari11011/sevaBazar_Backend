require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const customerRoutes = require('./src/modules/Customer/route'); // Adjust the path as per your project structure
const vendorRoutes = require('./src/modules/Vendor/route'); // Adjust the path as per your project structure
const ProductRoutes = require('./src/modules/Product/route');
const CategoryRoutes = require('./src/modules/Category/route');

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/test?retryWrites=true&w=majority`;
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

// Routes
app.use(customerRoutes);
app.use(vendorRoutes);
app.use(ProductRoutes);
app.use(CategoryRoutes);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
