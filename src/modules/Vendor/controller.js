const Vendor = require('./model.js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

require('dotenv').config();
const secret = process.env.JWT_SECRET;

// Controller function to create a new vendor
exports.createVendor = async (req, res) => {
  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // Create a new vendor with the hashed password
    const newVendor = new Vendor({
      name: req.body.name,
      password: hashedPassword,
      email: req.body.email,
      vendorInfo: req.body.vendorInfo,
      role: "vendor"
    });

    // Save the new vendor to the database
    await newVendor.save();

    res.status(201).send(newVendor);
  } catch (error) {
    console.log("error===>>", error)
    res.status(400).send(error);
  }
};

// Controller to fetch all vendors with role 'vendor'
exports.getAllVendors = async (req, res) => {
  try {
    // Fetch only vendors with the role 'vendor'
    const vendors = await Vendor.find({ role: 'vendor' });
    console.log("vendors api", vendors)
    res.status(200).send(vendors);
  } catch (error) {
    res.status(500).send(error);
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

// Controller function to update a vendor by ID
exports.updateVendor = async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ['name', 'passwordHash', 'email', 'vendorInfo', 'availableCities'];
  const isValidOperation = updates.every((update) => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return res.status(400).send({ error: 'Invalid updates!' });
  }

  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).send();
    }

    updates.forEach((update) => (vendor[update] = req.body[update]));
    await vendor.save();
    res.status(200).send(vendor);
  } catch (error) {
    res.status(400).send(error);
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
    // Find vendor by email
    const vendor = await Vendor.findOne({ email });

    // Check if vendor exists
    if (!vendor) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if the vendor is restricted
    if (vendor.isRestricted) {
      return res.status(403).json({ message: 'Your account is restricted. Please contact support.' });
    }

    // Check if password matches
    const isPasswordMatch = await vendor.comparePassword(password);
    console.log("isPasswordMatch==>>", isPasswordMatch);

    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: vendor._id, role: vendor.role }, secret);

    // Vendor authenticated successfully
    res.status(200).json({ message: 'Vendor authenticated successfully', vendor, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

//restrict vendor login
exports.restrictVendor = async (req, res) => {
  try {
      const { id } = req.params;

      // Find the vendor by ID and update the isRestricted field to true
      const updatedVendor = await Vendor.findByIdAndUpdate(
          id,
          { isRestricted: true },
          { new: true }
      );

      if (!updatedVendor) {
          return res.status(404).json({
              message: 'Vendor not found'
          });
      }

      // Send response confirming the update
      res.status(200).json({
          message: 'Vendor restricted successfully',
          vendor: updatedVendor
      });
  } catch (error) {
      console.error(error);
      res.status(500).json({
          message: 'Failed to restrict vendor',
          error: error.message
      });
  }
};

//Un-restrict vendor login
exports.unRestrictVendor = async (req, res) => {
  try {
      const { id } = req.params;

      // Find the vendor by ID and update the isRestricted field to true
      const updatedVendor = await Vendor.findByIdAndUpdate(
          id,
          { isRestricted: false },
          { new: true }
      );

      if (!updatedVendor) {
          return res.status(404).json({
              message: 'Vendor not found'
          });
      }

      // Send response confirming the update
      res.status(200).json({
          message: 'Vendor unrestricted successfully',
          vendor: updatedVendor
      });
  } catch (error) {
      console.error(error);
      res.status(500).json({
          message: 'Failed to unrestrict vendor',
          error: error.message
      });
  }
};
