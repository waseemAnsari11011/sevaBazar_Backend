const Vendor = require('./model.js');
const bcrypt = require('bcrypt');

// Controller function to create a new vendor
exports.createVendor = async (req, res) => {
    try {
      // Hash the password
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      console.log(hashedPassword)

      // Create a new vendor with the hashed password
      const newVendor = new Vendor({
        username: req.body.username,
        passwordHash: hashedPassword,
        email: req.body.email,
        vendorInfo: req.body.vendorInfo,
        availableCities: req.body.availableCities
      });
  
      // Save the new vendor to the database
      await newVendor.save();
  
      res.status(201).send(newVendor);
    } catch (error) {
      res.status(400).send(error);
    }
  };

// Controller function to get all vendors
exports.getAllVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find();
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
  const allowedUpdates = ['username', 'passwordHash', 'email', 'vendorInfo', 'availableCities'];
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
    const { username, password } = req.body;

  
    try {
      // Find vendor by username
      const vendor = await Vendor.findOne({ username });


  
      // Check if vendor exists
      if (!vendor) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
  
      // Check if password matches
      const isPasswordMatch = await vendor.comparePassword(password);
      console.log("isPasswordMatch==>>", isPasswordMatch)

      if (!isPasswordMatch) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }
  
      // Vendor authenticated successfully
      res.status(200).json({ message: 'Vendor authenticated successfully', vendor });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
