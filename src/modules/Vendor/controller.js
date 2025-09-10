const Vendor = require("./model.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

require("dotenv").config();
const secret = process.env.JWT_SECRET;

// Controller function to create a new vendor
exports.createVendor = async (req, res) => {
  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // 👇 MODIFIED: Build the location object, now including the address
    // The request body should now send address details inside the location object.
    const location = req.body.location
      ? {
          type: "Point",
          coordinates: req.body.location.coordinates, // [lng, lat]
          address: req.body.location.address, // Address is now nested here
        }
      : undefined;

    // Create a new vendor with the hashed password
    const newVendor = new Vendor({
      name: req.body.name,
      password: hashedPassword,
      email: req.body.email,
      vendorInfo: req.body.vendorInfo, // This object no longer contains the address
      category: req.body.category,
      role: "vendor",
      isOnline: req.body.isOnline ?? true,
      status: req.body.status ?? "online",
      location, // Assign the newly constructed location object
    });

    // Save the new vendor to the database
    await newVendor.save();

    res.status(201).json({
      message: "Vendor registered successfully",
      vendor: newVendor,
    });
  } catch (error) {
    console.error("error===>>", error);
    res.status(400).json({
      message: "Failed to register vendor",
      error: error.message,
    });
  }
};

// Controller function to update a vendor by ID
exports.updateVendor = async (req, res) => {
  const updates = Object.keys(req.body);
  // 👇 MODIFIED: Updated the list of allowed fields for modification
  const allowedUpdates = [
    "name",
    "email",
    "password",
    "vendorInfo",
    "location", // 'location' is now an allowed update
    "category",
    "isOnline",
    "status",
  ];
  const isValidOperation = updates.every((update) =>
    allowedUpdates.includes(update)
  );

  if (!isValidOperation) {
    return res.status(400).send({ error: "Invalid updates!" });
  }

  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).send();
    }

    // Handle password update separately to ensure it's hashed
    if (updates.includes("password")) {
      req.body.password = await bcrypt.hash(req.body.password, 10);
    }

    updates.forEach((update) => (vendor[update] = req.body[update]));
    vendor.updatedAt = Date.now(); // Update the timestamp
    await vendor.save();

    res.status(200).send(vendor);
  } catch (error) {
    res.status(400).send(error);
  }
};

// GET /vendors/search?q=...
exports.searchVendors = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ message: "Search query 'q' is required." });
    }
    // 👇 MODIFIED: Search logic now includes address fields inside location
    const vendors = await Vendor.find({
      $or: [
        { name: new RegExp(q, "i") },
        { "vendorInfo.businessName": new RegExp(q, "i") },
        { "location.address.city": new RegExp(q, "i") },
        { "location.address.state": new RegExp(q, "i") },
        { "location.address.postalCode": new RegExp(q, "i") },
      ],
    }).select("-password");

    res.status(200).json(vendors);
  } catch (error) {
    res.status(500).json({ message: "Error searching vendors", error });
  }
};

// ======================================================= //
// ======== NO CHANGES NEEDED FOR FUNCTIONS BELOW ======== //
// ======================================================= //

// Controller to fetch all vendors with role 'vendor'
exports.getAllVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find().select("-password");
    res.status(200).json(vendors);
  } catch (error) {
    res.status(500).json({ message: "Error fetching vendors", error });
  }
};

// Controller function to get a vendor by ID
exports.getVendorById = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).send();
    }
    res.status(200).send(vendor);
  } catch (error) {
    res.status(500).send(error);
  }
};

// Controller function to delete a vendor by ID
exports.deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) {
      return res.status(404).send();
    }
    res.status(200).send(vendor);
  } catch (error) {
    res.status(500).send(error);
  }
};

// Controller function for vendor login
exports.vendorLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (vendor.isRestricted) {
      return res.status(403).json({
        message: "Your account is restricted. Please contact support.",
      });
    }
    const isPasswordMatch = await vendor.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = jwt.sign({ id: vendor._id, role: vendor.role }, secret);
    res
      .status(200)
      .json({ message: "Vendor authenticated successfully", vendor, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//restrict vendor login
exports.restrictVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedVendor = await Vendor.findByIdAndUpdate(
      id,
      { isRestricted: true },
      { new: true }
    );
    if (!updatedVendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    res.status(200).json({
      message: "Vendor restricted successfully",
      vendor: updatedVendor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to restrict vendor",
      error: error.message,
    });
  }
};

//Un-restrict vendor login
exports.unRestrictVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedVendor = await Vendor.findByIdAndUpdate(
      id,
      { isRestricted: false },
      { new: true }
    );
    if (!updatedVendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    res.status(200).json({
      message: "Vendor unrestricted successfully",
      vendor: updatedVendor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to unrestrict vendor",
      error: error.message,
    });
  }
};

// GET /vendors/nearby?lat=...&lng=...
exports.getNearbyVendors = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res
        .status(400)
        .json({ message: "Latitude and longitude required" });
    }
    const vendors = await Vendor.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          distanceField: "distance",
          spherical: true,
          maxDistance: 5000,
        },
      },
    ]);
    res.status(200).json(vendors);
  } catch (error) {
    res.status(500).json({ message: "Error fetching nearby vendors", error });
  }
};

// PATCH /vendors/:id/toggle-status
exports.toggleVendorStatus = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    vendor.isOnline = !vendor.isOnline;
    vendor.status = vendor.isOnline ? "online" : "offline";
    vendor.updatedAt = Date.now();
    await vendor.save();
    res.status(200).json({
      message: `Vendor status updated to ${vendor.status}`,
      vendor,
    });
  } catch (error) {
    res.status(500).json({ message: "Error toggling vendor status", error });
  }
};

exports.getVendorsByCategory = async (req, res) => {
  console.log("getVendorsByCategory is called");
  try {
    const { categoryId } = req.params;
    const vendors = await Vendor.find({ category: categoryId }).select(
      "-password"
    );
    res.status(200).json(vendors);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching vendors by category", error });
  }
};

//Dukaan Details Page
exports.getVendorDetails = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id).select("-password");
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    res.status(200).json(vendor);
  } catch (error) {
    res.status(500).json({ message: "Error fetching vendor details", error });
  }
};
