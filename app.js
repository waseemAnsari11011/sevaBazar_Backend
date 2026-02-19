require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const customerRoutes = require("./src/modules/Customer/route");
const vendorAuthRoutes = require("./src/modules/Vendor/routes/vendor.auth.routes");
const vendorAdminRoutes = require("./src/modules/Vendor/routes/vendor.admin.routes");
const vendorCustomerRoutes = require("./src/modules/Vendor/routes/vendor.customer.routes");
const vendorPrivateRoutes = require("./src/modules/Vendor/routes/vendor.private.routes");

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
const settingsRoutes = require("./src/modules/Settings/route");
const VendorProductCategoryRoutes = require("./src/modules/VendorProductCategory/route");
const TicketRoutes = require("./src/modules/Ticket/route");
const driverRoutes = require("./src/modules/Driver/route");


// Initializing express application
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
  .then(() => {
    console.log("Connected to MongoDB:", mongoUri.replace(process.env.MONGO_PASSWORD, '****'));

    // Initialize Cron Jobs
    const initCronJobs = require('./src/scripts/cronJobs');
    initCronJobs();
  })
  .catch((err) => console.error("Could not connect to MongoDB", err));

// Routes
app.use(customerRoutes);

// Authentication routes
app.use("/vendors/auth", vendorAuthRoutes);

// Admin routes
app.use("/vendors/admin", vendorAdminRoutes);

// Customer routes
app.use("/vendors/customer", vendorCustomerRoutes);

// Vendor private routes
app.use("/vendors/me", vendorPrivateRoutes);

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
app.use("/settings", settingsRoutes);
app.use("/tickets", TicketRoutes);
app.use(VendorProductCategoryRoutes);
app.use(driverRoutes);


console.log("Ticket Routes Registered");

// For any other route, serve the index.html file
app.get("*", (req, res) => {
  console.log("404 Hit: ", req.originalUrl); // Log the URL that caused the fall-through
  const indexPath = path.join(__dirname, "..", "sevabazar_panel", "build", "index.html");

  const fs = require('fs'); // Ensure fs is available
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({
      error: "Not Found",
      message: "The requested resource was not found.",
      path: req.originalUrl
    });
  }
});

const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }
});

// Attach io to app so it can be accessed in controllers
app.set("io", io);

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", (userId) => {
    socket.join(userId);
    socket.userId = userId; // Store userId on socket for rejection handling
  });

  socket.on("order_rejected", async ({ orderId }) => {
    const OrderAssignment = require("./src/modules/Driver/orderAssignment.model");
    const Order = require("./src/modules/Order/model");
    try {
      // Find actual order document if it was 6-digit code
      let dbOrderId = orderId;
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        const orderDoc = await Order.findOne({ orderId });
        if (orderDoc) dbOrderId = orderDoc._id;
      }

      if (socket.userId) {
        await OrderAssignment.findOneAndUpdate(
          { orderId: dbOrderId, driverId: socket.userId },
          { status: 'rejected' }
        );
        console.log(`[SOCKET] Order ${orderId} rejected by driver ${socket.userId}`);
      }
    } catch (err) {
      console.error("Error handling order_rejected:", err);
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${port}`);
});
