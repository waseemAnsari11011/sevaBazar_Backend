const Customer = require('./model'); // Ensure the correct path to the customer model
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sendOtp = require('../utils/sendOtp');
require('dotenv').config();
const secret = process.env.JWT_SECRET;

// Controller function to create a new customer
exports.createCustomer = async (req, res) => {
  try {
    console.log("req--->>>", req.body)
    const { name, password, email, contactNumber, availableLocalities } = req.body;

    if ( !password || !email || !contactNumber || !availableLocalities) {
      return res.status(400).send({ error: 'All fields are required' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if the email already exists
    const existingCustomer = await Customer.findOne({ email });
    if (existingCustomer) {
      return res.status(400).send({ error: 'Email already in use' });
    }

    // Create a new customer with the hashed password
    const newCustomer = new Customer({
      name,
      password: hashedPassword,
      email,
      contactNumber,
      availableLocalities,
      role: "customer"
    });

    await newCustomer.save();
    res.status(201).send(newCustomer);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'An error occurred while creating the customer' });
  }
};



exports.customerLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find customer by email
    const customer = await Customer.findOne({ email });

    // Check if customer exists
    if (!customer) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if the customer is restricted
    if (customer.isRestricted) {
      return res.status(403).json({ message: 'Your account is restricted. Please contact support.' });
    }

    // Check if password matches
    const isPasswordMatch = await bcrypt.compare(password, customer.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate a token
    const token = jwt.sign({ id: customer._id, role: customer.role }, secret, { expiresIn: '1h' });

    // Customer authenticated successfully
    res.status(200).json({ message: 'Login successful', customer, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Controller function to get all customers
exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find();
    res.status(200).send(customers);
  } catch (error) {
    res.status(500).send(error);
  }
};

// Controller function to get a customer by ID
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).send();
    }
    res.status(200).send(customer);
  } catch (error) {
    res.status(500).send(error);
  }
};

// Controller function to update a customer by ID
exports.updateCustomer = async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ['name', 'passwordHash', 'email', 'personalInfo', 'shippingAddresses'];
  const isValidOperation = updates.every((update) => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return res.status(400).send({ error: 'Invalid updates!' });
  }

  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).send();
    }

    updates.forEach((update) => (customer[update] = req.body[update]));
    await customer.save();
    res.status(200).send(customer);
  } catch (error) {
    res.status(400).send(error);
  }
};

// Controller function to delete a customer by ID
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).send();
    }
    res.status(200).send(customer);
  } catch (error) {
    res.status(500).send(error);
  }
};

exports.sendOtp = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ message: 'Phone number is required' });
  }

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000);

  const result = await sendOtp(phoneNumber, otp);

  if (result) {
    res.status(200).json({ message: 'OTP sent successfully', otp });
  } else {
    res.status(500).json({ message: 'Failed to send OTP' });
  }
}
