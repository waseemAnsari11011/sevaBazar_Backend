const Ticket = require('./model');

exports.createTicket = async (req, res) => {
  try {
    const { customerId, vendorId, driverId, userType, reason } = req.body;

    const ticketData = {
      reason: reason || 'General Inquiry',
      userType: userType || 'Customer'
    };

    if (userType === 'Vendor') {
      if (!vendorId) return res.status(400).json({ success: false, message: 'Vendor ID is required' });
      ticketData.vendor = vendorId;
    } else if (userType === 'Driver') {
      if (!driverId) return res.status(400).json({ success: false, message: 'Driver ID is required' });
      ticketData.driver = driverId;
    } else {
      // Default to Customer
      if (!customerId) return res.status(400).json({ success: false, message: 'Customer ID is required' });
      ticketData.customer = customerId;
    }

    const newTicket = new Ticket(ticketData);

    await newTicket.save();
    res.status(201).json({ success: true, message: 'Ticket created successfully', ticket: newTicket });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getAllTickets = async (req, res) => {
  try {
    const { userType } = req.query;
    console.log('Fetching tickets for userType:', userType);
    const filter = {};
    if (userType) {
      if (userType.toLowerCase() === 'customer') {
        filter.$or = [
          { userType: /^customer$/i },
          { userType: { $exists: false } },
          { customer: { $exists: true } } // Special case for pure legacy
        ];
      } else {
        filter.userType = new RegExp(`^${userType}$`, 'i');
      }
    }
    console.log('Constructed filter:', JSON.stringify(filter));

    const tickets = await Ticket.find(filter)
      .populate('customer', 'name contactNumber email')
      .populate('vendor', 'name vendorInfo.businessName email')
      .populate('driver', 'name contactNumber email')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
