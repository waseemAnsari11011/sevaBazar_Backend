const Vendor = require("./model.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Customer = require("../Customer/model.js");
const createLocationFilter = require("../utils/locationFilter.js");
const { Product, ProductVariation } = require("../Product/model.js");

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
  console.log("getAllVendors is called");
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // 1. Get the location filter from the utility
    const locationFilter = await createLocationFilter(req);

    // 2. If no filter (e.g., no active address), return an empty array
    // This enforces the app's location-based rule.
    if (!locationFilter) {
      return res.status(200).json({ total: 0, page, limit, vendors: [] });
    }

    // 3. Base filter: only online, non-restricted vendors
    const baseFilter = {
      status: "online",
      isRestricted: false,
    };

    // 4. Combine the base filter with the location filter
    const finalFilter = {
      ...baseFilter,
      ...locationFilter, // Spread the { $or: [...] }
    };

    // 5. Find vendors, sort by most recent, apply pagination
    const vendors = await Vendor.find(finalFilter)
      .sort({ createdAt: -1 }) // Sort by creation date
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-password"); // Exclude password

    // 6. Count total documents matching the filter for pagination metadata
    const totalVendors = await Vendor.countDocuments(finalFilter);

    res.status(200).json({
      total: totalVendors,
      page,
      limit,
      vendors: vendors, // Send vendors back in a 'vendors' key
    });
  } catch (error) {
    console.error("Error in getAllVendors:", error);

    // Handle specific errors thrown by the utility
    if (error.message.includes("Authentication error")) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes("Customer not found")) {
      return res.status(404).json({ message: error.message });
    }

    // Generic fallback error
    res
      .status(500)
      .json({ message: "Error fetching vendors", error: error.message });
  }
};

exports.getAllVendorsAdmin = async (req, res) => {
  console.log("this api is called!!");
  try {
    // Find all documents in the Vendor collection.
    // .select() is used to fetch only the fields required by the frontend.
    // This improves performance by not sending unnecessary data like password hashes.
    // .sort() orders the results, showing the most recently created vendors first.
    const vendors = await Vendor.find({})
      .select(
        "name email vendorInfo.contactNumber location.address.postalCodes isRestricted"
      )
      .sort({ createdAt: -1 });

    // Send a success response with the fetched vendors
    res.status(200).json(vendors);
  } catch (error) {
    // Log the error for debugging purposes
    console.error("Error fetching vendors for admin:", error);

    // Send an error response if something goes wrong
    res.status(500).json({ message: "Server error. Could not fetch vendors." });
  }
};

exports.getVendorsWithDiscounts = async (req, res) => {
  console.log("getVendorsWithDiscounts is called");
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 1. Get the same location filter as the other endpoint
    const locationFilter = await createLocationFilter(req);
    if (!locationFilter) {
      // If no active address, no vendors can be found
      return res.status(200).json({ total: 0, page, limit, vendors: [] });
    }

    // 2. Base filter for vendors
    const baseFilter = {
      status: "online",
      isRestricted: false,
    };

    // 3. The Aggregation Pipeline
    const pipeline = [
      // Stage 1: Initial match on vendors (online, not restricted, and in the user's location)
      {
        $match: {
          ...baseFilter,
          ...locationFilter,
        },
      },
      // Stage 2: Join Vendor with Products
      {
        $lookup: {
          from: "products", // The collection name for the Product model
          localField: "_id",
          foreignField: "vendor",
          as: "products",
        },
      },
      // Stage 3: Unwind the products array to process each product individually
      { $unwind: "$products" },
      // Stage 4: Join Product with ProductVariations
      {
        $lookup: {
          from: "productvariations", // The collection name for ProductVariation
          localField: "products.variations",
          foreignField: "_id",
          as: "variations",
        },
      },
      // Stage 5: Unwind the variations array
      { $unwind: "$variations" },
      // Stage 6: Filter for variations that actually have a discount
      {
        $match: {
          "variations.discount": { $gt: 0 },
        },
      },
      // Stage 7: Group back by vendor to find the max discount for each
      {
        $group: {
          _id: "$_id",
          maxDiscount: { $max: "$variations.discount" },
          // Use $first to carry over the original vendor data
          doc: { $first: "$$ROOT" },
        },
      },
      // Stage 8: Replace the root to reshape the document back to a vendor structure
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ["$doc", { maxDiscount: "$maxDiscount" }],
          },
        },
      },

      // --- MODIFICATION START ---

      // Stage 9: Add a new field with a random value for sorting
      {
        $addFields: {
          randomSort: { $rand: {} },
        },
      },

      // Stage 10: Sort vendors randomly instead of by maxDiscount
      { $sort: { randomSort: 1 } },

      // Stage 11: Remove fields we added, including the temporary randomSort
      {
        $project: {
          products: 0,
          variations: 0,
          password: 0, // IMPORTANT: always exclude sensitive data
          randomSort: 0, // Remove the temporary field
        },
      },

      // --- MODIFICATION END ---

      // Stage 12: Use $facet to get both total count and paginated data in one query
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ];

    // 4. Execute the aggregation
    const results = await Vendor.aggregate(pipeline);

    const vendors = results[0].data;
    const totalVendors = results[0].metadata[0]?.total || 0;

    res.status(200).json({
      total: totalVendors,
      page,
      limit,
      vendors: vendors,
    });
  } catch (error) {
    console.error("Error in getVendorsWithDiscounts:", error);
    if (error.message.includes("Authentication error")) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes("Customer not found")) {
      return res.status(404).json({ message: error.message });
    }
    res
      .status(500)
      .json({ message: "Error fetching vendors", error: error.message });
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

exports.getAllVendorsGroupedByCategory = async (req, res) => {
  console.log("getAllVendorsGroupedByCategory is called");
  try {
    // 1. Get the location filter from your utility
    const locationFilter = await createLocationFilter(req);

    // 2. If no filter (e.g., no active address), return an empty array
    if (!locationFilter) {
      return res.status(200).json([]);
    }

    // 3. Define the aggregation pipeline
    const pipeline = [
      {
        // Stage 1: Find all vendors matching the user's location filter
        $match: locationFilter,
      },
      {
        // --- (NEW) Stage 2: Add a random sort field to each document ---
        // This is the key to shuffling
        $addFields: {
          randomSort: { $rand: {} },
        },
      },
      {
        // --- (NEW) Stage 3: Sort by category, THEN by the random field ---
        // This groups vendors by category, but randomizes their order *within* that category
        $sort: {
          category: 1,
          randomSort: 1,
        },
      },
      {
        // Stage 4: Group the randomly-sorted vendors
        $group: {
          _id: "$category", // Group by the category ObjectId
          // The 'vendors' array is now in a random order
          vendors: { $push: "$$ROOT" },
        },
      },
      {
        // Stage 5: Populate the category details
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        // Stage 6: Unwind the category details
        $unwind: "$categoryDetails",
      },
      {
        // --- (MODIFIED) Stage 7: Format output AND slice the vendors array ---
        $project: {
          _id: 0,
          category: "$categoryDetails",
          // --- OPTIMIZATION: Only send 4 random vendors ---
          // This takes the full, randomized 'vendors' array and
          // returns only the first 4 elements.
          vendors: { $slice: ["$vendors", 4] },
        },
      },
      {
        // Stage 8: Sort the final list of *categories* by name
        $sort: { "category.name": 1 },
      },
    ];

    // 4. Execute the aggregation query
    const categorizedVendors = await Vendor.aggregate(pipeline);

    // 5. Post-process to remove sensitive data
    // (This also includes the fix from your previous question to keep shopPhoto)
    categorizedVendors.forEach((group) => {
      // The 'vendors' array now only has 4 (or fewer) items
      group.vendors.forEach((vendor) => {
        vendor.password = undefined;
        vendor.bankDetails = undefined;
        vendor.resetPasswordToken = undefined;
        vendor.resetPasswordExpires = undefined;
        vendor.randomSort = undefined; // Remove the random field we added

        // Specifically hide sensitive documents, but keep shopPhoto
        if (vendor.documents) {
          vendor.documents.selfiePhoto = undefined;
          vendor.documents.aadharFrontDocument = undefined;
          vendor.documents.aadharBackDocument = undefined;
          vendor.documents.panCardDocument = undefined;
        }
        // Add any other sensitive fields you want to hide
      });
    });

    res.status(200).json(categorizedVendors);
  } catch (error) {
    console.error("Error in getAllVendorsGroupedByCategory:", error);

    // Error handling
    if (error.message.includes("Authentication error")) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes("Customer not found")) {
      return res.status(404).json({ message: error.message });
    }

    // Generic fallback error
    res.status(500).json({
      message: "Error fetching vendors grouped by category",
      error: error.message,
    });
  }
};

exports.getVendorsByCategory = async (req, res) => {
  console.log("getVendorsByCategory is called");
  try {
    const { categoryId } = req.params;

    // 1. Get the location filter from the utility
    // This one line replaces ~40 lines of code
    const locationFilter = await createLocationFilter(req);

    // 2. If no filter (e.g., no active address), return empty array
    if (!locationFilter) {
      return res.status(200).json([]);
    }

    // 3. Build the final query by merging the category filter and location filter
    const finalQuery = {
      category: categoryId,
      ...locationFilter, // Spread the { $or: [...] } object
    };

    // 4. Find vendors matching the combined query
    const vendors = await Vendor.find(finalQuery).select("-password");

    res.status(200).json(vendors);
  } catch (error) {
    console.error("Error in getVendorsByCategory:", error);

    // Handle specific errors thrown by the utility
    if (error.message.includes("Authentication error")) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes("Customer not found")) {
      return res.status(404).json({ message: error.message });
    }

    // Generic fallback error
    res.status(500).json({
      message: "Error fetching vendors by category",
      error: error.message,
    });
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

// Controller function for admin to login as a vendor
exports.adminLoginAsVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    // The authorizeAdmin middleware already confirmed the requester is an admin.
    const vendorToLogin = await Vendor.findById(vendorId).select("-password");

    if (!vendorToLogin) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Generate a token for the specified vendor
    const token = jwt.sign(
      { id: vendorToLogin._id, role: vendorToLogin.role },
      secret
    );

    // Send the vendor's data and the new token back
    res.status(200).json({
      message: "Logged in as vendor successfully",
      vendor: vendorToLogin,
      token: token,
    });
  } catch (error) {
    console.error("Admin login as vendor error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 👇 ADD THIS NEW FUNCTION
exports.searchVendorsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { q } = req.query; // q will be our search query, e.g., /search/some-id?q=parlor

    if (!q) {
      // If search query is empty, return all vendors for the category
      const vendors = await Vendor.find({ category: categoryId });
      return res.status(200).json(vendors);
    }

    const searchQuery = new RegExp(q, "i"); // 'i' for case-insensitive search

    const vendors = await Vendor.find({
      category: categoryId,
      $or: [{ "vendorInfo.businessName": searchQuery }, { name: searchQuery }],
    });

    res.status(200).json(vendors);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error searching vendors", error: error.message });
  }
};
