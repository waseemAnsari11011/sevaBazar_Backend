const Customer = require('./model'); // Ensure the correct path to the customer model

// Controller function to create a new customer
exports.createCustomer = async (req, res) => {
  try {
    const newCustomer = new Customer(req.body);
    await newCustomer.save();
    res.status(201).send(newCustomer);
  } catch (error) {
    res.status(400).send(error);
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
  const allowedUpdates = ['username', 'passwordHash', 'email', 'personalInfo', 'shippingAddresses'];
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
