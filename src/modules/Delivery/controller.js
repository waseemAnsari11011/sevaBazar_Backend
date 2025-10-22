const Delivery = require("./model"); // Ensure the correct path to the delivery model
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const secret = process.env.JWT_SECRET;

exports.deliveryLoginPhone = async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    if (!phoneNumber) {
      return res.status(400).send({ error: "All fields are required" });
    }

    let delivery;

    const existingDelivery = await Delivery.findOne({
      contactNumber: phoneNumber,
    });
    delivery = existingDelivery;

    if (!existingDelivery) {
      // Create a new delivery with the contact number
      const newDelivery = new Delivery({
        contactNumber: phoneNumber,
        role: "delivery",
      });

      await newDelivery.save();
      delivery = newDelivery;
    }

    // Generate a token
    const token = jwt.sign({ id: delivery._id, role: delivery.role }, secret);

    res.status(200).json({ message: "Login successful", delivery, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Controller function to get a delivery by ID
exports.getDeliveryById = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) {
      return res.status(404).send();
    }
    res.status(200).send(delivery);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.updateDelivery = async (req, res) => {
  try {
    // Extract delivery ID from route parameters
    const deliveryId = req.params.id;

    console.log("deliveryId--->>", deliveryId);

    // Extract new delivery details from request body
    const updatedData = req.body;

    // Handle file uploads if any
    if (req.files && req.files.length > 0) {
      const filePaths = req.files.map((file) => file.path);
      updatedData.image = filePaths[0]; // Assuming one image per delivery, adjust as needed
    }

    // Find the delivery by ID and update their details
    const updatedDelivery = await Delivery.findByIdAndUpdate(
      deliveryId,
      updatedData,
      { new: true, runValidators: true }
    );

    console.log("updatedDelivery", updatedDelivery);

    // Check if delivery was found and updated
    if (!updatedDelivery) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    // Respond with the updated delivery details
    res.status(200).json(updatedDelivery);
  } catch (error) {
    // Handle errors and send error response
    console.error("Error updating delivery:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.checkIfUserIsRestricted = async (req, res) => {
  try {
    const { contactNumber } = req.body;

    console.log("contactNumber-->>", contactNumber);

    // Validate if at least one identifier is provided
    if (!contactNumber) {
      return res.status(400).json({ error: "contact number is required" });
    }

    // Find the delivery by  or contact number
    const delivery = await Delivery.findOne({ contactNumber });

    console.log("delivery--->>", delivery);

    // If delivery is not found, return an error
    if (!delivery) {
      return res.status(200).json({ error: "User not found" });
    }

    // Check if the delivery is restricted
    if (delivery.isRestricted) {
      return res.status(403).json({ message: "User is restricted" });
    }

    // If the user is not restricted
    return res.status(200).json({ message: "User is not restricted" });
  } catch (error) {
    // Handle any errors
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.updateFcm = async (req, res) => {
  console.log("it is called!!");
  try {
    // Extract delivery ID from route parameters
    const deliveryId = req.params.id;

    console.log("deliveryId--->>", deliveryId);

    // Extract new delivery details from request body
    const updatedData = req.body;

    // console.log("updatedData-->>", updatedData)

    // Find the delivery by ID and update their details
    const updatedDelivery = await Delivery.findByIdAndUpdate(
      deliveryId,
      updatedData,
      { new: true, runValidators: true }
    );

    // Check if delivery was found and updated
    if (!updatedDelivery) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    // Respond with the updated delivery details
    res.status(200).json(updatedDelivery);
  } catch (error) {
    // Handle errors and send error response
    console.error("Error updating delivery:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
