const Vendor = require("./model.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

require("dotenv").config();
const secret = process.env.JWT_SECRET;

exports.createVendor = async (req, res) => {
  try {
    // Parse JSON strings from form data
    let vendorInfo, location, placeId, bankDetails, upiDetails;

    try {
      vendorInfo = req.body.vendorInfo ? JSON.parse(req.body.vendorInfo) : {};
      location = req.body.location ? JSON.parse(req.body.location) : {};
      placeId = req.body.placeId;
      bankDetails = req.body.bankDetails
        ? JSON.parse(req.body.bankDetails)
        : {};
      upiDetails = req.body.upiDetails ? JSON.parse(req.body.upiDetails) : {};
    } catch (parseError) {
      return res.status(400).json({
        message: "Invalid JSON format in request body",
        error: parseError.message,
      });
    }

    // Check for existing vendor with the same email or phone number
    const existingVendor = await Vendor.findOne({
      $or: [
        { email: req.body.email },
        { "vendorInfo.contactNumber": vendorInfo.contactNumber },
      ],
    });

    if (existingVendor) {
      if (existingVendor.email === req.body.email) {
        return res
          .status(409)
          .json({ message: "Vendor with this email already exists" });
      }
      if (
        existingVendor.vendorInfo.contactNumber === vendorInfo.contactNumber
      ) {
        return res
          .status(409)
          .json({ message: "Vendor with this phone number already exists" });
      }
    }

    // Validate required files
    if (!req.files || !req.files.shopPhoto || !req.files.selfiePhoto) {
      return res.status(400).json({
        message:
          "All required documents must be uploaded (shop photo, selfie, and Aadhar/PAN document)",
      });
    }

    // Get S3 URLs from uploaded files
    const shopPhotoUrls = req.files.shopPhoto.map((file) => file.location);
    const selfiePhotoUrl = req.files.selfiePhoto[0].location;
    const aadharFrontDocumentUrl = req.files.aadharFrontDocument
      ? req.files.aadharFrontDocument[0].location
      : null;
    const aadharBackDocumentUrl = req.files.aadharBackDocument
      ? req.files.aadharBackDocument[0].location
      : null;
    const panCardDocumentUrl = req.files.panCardDocument
      ? req.files.panCardDocument[0].location
      : null;

    const qrCodeUrl = req.files.qrCode ? req.files.qrCode[0].location : null;

    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // Build the location object
    const locationData = location
      ? {
          type: "Point",
          coordinates: location.coordinates || [], // [lng, lat]
          address: {
            ...location.address,
          },
        }
      : undefined;

    // Create a new vendor with the hashed password and document URLs
    const newVendor = new Vendor({
      name: req.body.name,
      password: hashedPassword,
      email: req.body.email,
      vendorInfo: vendorInfo,
      category: req.body.category,
      role: "vendor",
      isOnline: req.body.isOnline ?? true,
      status: req.body.status ?? "online",
      location: locationData,
      documents: {
        shopPhoto: shopPhotoUrls,
        selfiePhoto: selfiePhotoUrl,
        aadharFrontDocument: aadharFrontDocumentUrl,
        aadharBackDocument: aadharBackDocumentUrl,
        panCardDocument: panCardDocumentUrl,
      },
      bankDetails,
      upiDetails: {
        ...upiDetails,
        qrCode: qrCodeUrl,
      },
      ...(placeId && { placeId }),
    });

    // Save the new vendor to the database
    await newVendor.save();

    // Remove password from response
    const vendorResponse = newVendor.toObject();
    delete vendorResponse.password;

    res.status(201).json({
      message: "Vendor registered successfully",
      vendor: vendorResponse,
    });
  } catch (error) {
    console.error("Create Vendor Error:", error);

    // Handle duplicate key errors (for email and phone number)
    if (error.code === 11000) {
      if (error.keyPattern?.email) {
        return res.status(409).json({
          message:
            "Email already exists. Please use a different email address.",
        });
      }
      if (error.keyPattern && error.keyPattern["vendorInfo.contactNumber"]) {
        return res.status(409).json({
          message:
            "Phone number already exists. Please use a different phone number.",
        });
      }
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    res.status(500).json({
      message: "Failed to register vendor",
      error: error.message,
    });
  }
};

// Controller function to update a vendor by ID
exports.updateVendor = async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = [
    "name",
    "email",
    "password",
    "vendorInfo",
    "location",
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

    if (updates.includes("password")) {
      req.body.password = await bcrypt.hash(req.body.password, 10);
    }

    updates.forEach((update) => (vendor[update] = req.body[update]));
    vendor.updatedAt = Date.now();
    await vendor.save();

    // 👇 CHANGE HERE: Wrap the response in a 'vendor' object
    res.status(200).send({ vendor });
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
    const vendorId = req.params.vendorId;
    // Find the vendor by their ID and populate the category field
    const vendor = await Vendor.findById(vendorId).populate("category", "name");

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Return the vendor's details
    res.status(200).json({
      message: "Vendor details fetched successfully",
      vendor: vendor,
    });
  } catch (error) {
    console.error("Get Vendor by ID Error:", error);
    res.status(500).json({
      message: "Failed to fetch vendor details",
      error: error.message,
    });
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
  const { emailOrPhone, password } = req.body;

  try {
    let vendor = await Vendor.findOne({ email: emailOrPhone });
    if (!vendor) {
      vendor = await Vendor.findOne({
        "vendorInfo.contactNumber": emailOrPhone,
      });
    }

    if (!vendor) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (vendor.isRestricted) {
      return res.status(403).json({
        message: "Your account is restricted. Please contact support.",
      });
    }
    const isPasswordMatch = await vendor.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
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

exports.updateVendorAddress = async (req, res) => {
  const { vendorId } = req.params;
  const { address, landmark, postalCode, latitude, longitude } = req.body;

  try {
    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    vendor.location.address.addressLine1 = address;
    vendor.location.address.landmark = landmark;
    vendor.location.address.postalCode = postalCode;
    vendor.location.coordinates = [longitude, latitude];

    await vendor.save();

    res.status(200).json({
      message: "Vendor address updated successfully",
      vendor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Forgot Password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const vendor = await Vendor.findOne({ email });

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Generate a reset token
    const token = crypto.randomBytes(20).toString("hex");
    vendor.resetPasswordToken = token;
    vendor.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await vendor.save();

    console.log("EMAIL:", process.env.EMAIL);
    console.log("EMAIL_PASSWORD:", process.env.EMAIL_PASSWORD);

    // Create a transporter for sending emails (configure with your email service)
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    const mailOptions = {
      to: vendor.email,
      from: "passwordreset@demo.com",
      subject: "Password Reset",
      text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
        Please click on the following link, or paste this into your browser to complete the process:\n\n
        ${resetUrl}\n\n
        If you did not request this, please ignore this email and your password will remain unchanged.\n`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!vendor) {
      return res
        .status(400)
        .json({ message: "Password reset token is invalid or has expired." });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    vendor.password = hashedPassword;
    vendor.resetPasswordToken = undefined;
    vendor.resetPasswordExpires = undefined;

    await vendor.save();

    res.status(200).json({ message: "Password has been reset." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
