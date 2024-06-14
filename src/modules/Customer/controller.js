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

    if (!password || !email || !contactNumber || !availableLocalities) {
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
    const token = jwt.sign({ id: customer._id, role: customer.role }, secret);

    // Customer authenticated successfully
    res.status(200).json({ message: 'Login successful', customer, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.customerLoginPhone = async (req, res) => {
  const { phoneNumber, uid } = req.body;

  try {
    if (!phoneNumber || !uid) {
      return res.status(400).send({ error: 'All fields are required' });
    }

    let customer;

    const existingCustomer = await Customer.findOne({ contactNumber: phoneNumber });
    customer = existingCustomer;

    if (!existingCustomer) {
      // Create a new customer with the contact number
      const newCustomer = new Customer({
        contactNumber: phoneNumber,
        role: "customer",
      });

      await newCustomer.save();
      customer = newCustomer;
    }

    // Generate a token
    const token = jwt.sign({ id: customer._id, role: customer.role }, secret);

    res.status(200).json({ message: 'Login successful', customer, token });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
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
  console.log("it is called!!")
  try {
    // Extract customer ID from route parameters
    const customerId = req.params.id;

    console.log("customerId--->>", customerId)

    // Extract new customer details from request body
    const updatedData = req.body;


    // Handle file uploads if any
    if (req.files && req.files.length > 0) {
      const filePaths = req.files.map(file => file.path);
      updatedData.image = filePaths[0]; // Assuming one image per customer, adjust as needed
    }

    // Find the customer by ID and update their details
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      updatedData,
      { new: true, runValidators: true }
    );

    console.log("updatedCustomer", updatedCustomer)


    // Check if customer was found and updated
    if (!updatedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Respond with the updated customer details
    res.status(200).json(updatedCustomer);
  } catch (error) {
    // Handle errors and send error response
    console.error('Error updating customer:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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


// Controller function to save address and available localities for a user
exports.saveAddressAndLocalities = async (req, res) => {

  try {
    const { addressLine1, city, state, country, postalCode, availableLocalities } = req.body;
    const { id } = req.params; // Assuming userId is passed in the URL params or request body


    // Find the user by userId
    const user = await Customer.findById(id);

    console.log("user-->>", user)

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add the new address to user's shippingAddresses array
    user.shippingAddresses = {
      address: addressLine1,
      city,
      state,
      country,
      postalCode
    }

    // Update user's availableLocalities
    user.availableLocalities = availableLocalities;

    // Save the updated user
    await user.save();

    return res.status(200).json({ message: 'Address and localities saved successfully', user });
  } catch (error) {
    console.error('Error saving address and localities:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


// Controller to fetch all customer with role 'customer'
exports.getAllCustomers = async (req, res) => {
  try {
    // Fetch only customer with the role 'customer'
    const customers = await Customer.find({ role: 'customer' });
    console.log("customers api", customers)
    res.status(200).send(customers);
  } catch (error) {
    res.status(500).send(error);
  }
};


//restrict customer login
exports.restrictCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the customer by ID and update the isRestricted field to true
    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      { isRestricted: true },
      { new: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({
        message: 'Customer not found'
      });
    }

    // Send response confirming the update
    res.status(200).json({
      message: 'Customer restricted successfully',
      customer: updatedCustomer
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Failed to restrict customer',
      error: error.message
    });
  }
};

//Un-restrict customer login
exports.unRestrictCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the customer by ID and update the isRestricted field to true
    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      { isRestricted: false },
      { new: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({
        message: 'Customer not found'
      });
    }

    // Send response confirming the update
    res.status(200).json({
      message: 'Customer unrestricted successfully',
      customer: updatedCustomer
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Failed to unrestrict customer',
      error: error.message
    });
  }
};

exports.checkIfUserIsRestricted = async (req, res) => {
  try {
    const { email, contactNumber } = req.body;

    console.log("contactNumber-->>", contactNumber, email)

    // Validate if at least one identifier is provided
    if (!email && !contactNumber) {
      return res.status(400).json({ error: 'Email or contact number is required' });
    }

    // Find the customer by email or contact number
    const customer = await Customer.findOne({contactNumber});

    console.log("customer--->>", customer)

    // If customer is not found, return an error
    if (!customer) {
      return res.status(200).json({ error: 'Customer not found' });
    }

    // Check if the customer is restricted
    if (customer.isRestricted) {
      return res.status(403).json({ message: 'User is restricted' });
    }

    // If the user is not restricted
    return res.status(200).json({ message: 'User is not restricted' });

  } catch (error) {
    // Handle any errors
    return res.status(500).json({ error: 'Internal server error' });
  }
};


