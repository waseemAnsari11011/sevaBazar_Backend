const Inquiry = require('./model');

// Create a new inquiry
exports.createInquiry = async (req, res) => {
    try {
        const { subject, message, user } = req.body;
      
        console.log("subject, message--->>>", subject, message, user)
        const inquiry = new Inquiry({
            user: user,
            subject,
            message
        });
        await inquiry.save();
        res.status(201).json({ message: 'Inquiry submitted successfully', inquiry });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to submit inquiry', error: error.message });
    }
};

// Get user inquiries (for user)
exports.getUserInquiries = async (req, res) => {
    try {
        const userId = req.params.id
        console.log("userId-->>", userId)
        const inquiries = await Inquiry.find({ user: userId });
        console.log("inquiries-->>", inquiries)

        res.status(200).json(inquiries);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to get user inquiries', error: error.message });
    }
};



// Get all inquiries (for admin)
exports.getAllInquiries = async (req, res) => {
    try {
        const inquiries = await Inquiry.find().populate('user', 'name contactNumber');
        res.status(200).json(inquiries);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to get inquiries', error: error.message });
    }
};

// Respond to an inquiry (for admin)
exports.respondToInquiry = async (req, res) => {
    try {
        const { Inquiryresponse } = req.body;
        console.log("response-->>", Inquiryresponse, req.params.id)

        const inquiry = await Inquiry.findById(req.params.id);


        if (!inquiry) {
            return res.status(404).json({ message: 'Inquiry not found' });
        }

        inquiry.response = Inquiryresponse;
        inquiry.status = 'responded';
        inquiry.respondedAt = Date.now();
        await inquiry.save();

        res.status(200).json({ message: 'Inquiry responded successfully', inquiry });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to respond to inquiry', error: error.message });
    }
};
