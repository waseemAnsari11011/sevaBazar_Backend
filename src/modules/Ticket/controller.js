const Ticket = require('./model');

exports.createTicket = async (req, res) => {
  try {
    const { customerId, reason } = req.body;
    
    if (!customerId) {
        return res.status(400).json({ success: false, message: 'Customer ID is required' });
    }

    const newTicket = new Ticket({
      customer: customerId,
      reason: reason || 'General Inquiry' 
    });
    
    await newTicket.save();
    res.status(201).json({ success: true, message: 'Ticket created successfully', ticket: newTicket });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getAllTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find().populate('customer', 'name contactNumber email').sort({ createdAt: -1 });
    res.status(200).json({ success: true, tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
