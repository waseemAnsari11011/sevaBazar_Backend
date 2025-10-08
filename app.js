require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const customerRoutes = require("./src/modules/Customer/route");
const vendorRoutes = require("./src/modules/Vendor/route");
const ProductRoutes = require("./src/modules/Product/route");
const CategoryRoutes = require("./src/modules/Category/route");
const OrderRoutes = require("./src/modules/Order/route");
const ReportRoutes = require("./src/modules/Reports/route");
const InquiryRoutes = require("./src/modules/Inquiry/route");
const FaqsRoutes = require("./src/modules/HelpCenter/route");
const ContactRoutes = require("./src/modules/Contactus/route");
const BannerRoutes = require("./src/modules/Banner/route");
const ChatOrder = require("./src/modules/ChatOrdrer/route");
const deliveryRoutes = require("./src/modules/Delivery/route");

const app = express();
// More robust CORS configuration
app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    allowedHeaders: "Content-Type,Authorization",
  })
);
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies with increased limit
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));

// Serve static files from the 'build' directory of the frontend
app.use(express.static(path.join(__dirname, "..", "sevabazar_panel", "build")));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB connection
const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
mongoose
  .connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Could not connect to MongoDB", err));

// Routes
app.use(customerRoutes);
app.use("/vendors", vendorRoutes);
app.use(ProductRoutes);
app.use(CategoryRoutes);
app.use(OrderRoutes);
app.use(ReportRoutes);
app.use(InquiryRoutes);
app.use(FaqsRoutes);
app.use(ContactRoutes);
app.use(BannerRoutes);
app.use(ChatOrder);
app.use(deliveryRoutes);

// For any other route, serve the index.html file
app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "sevabazar_panel", "build", "index.html")
  );
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
