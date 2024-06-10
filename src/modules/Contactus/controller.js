const Contact = require('./model');

// Create a new contact
exports.createContact = async (req, res) => {
    try {
        const { phone, email, instagramId, twitterId, facebookId } = req.body;

        // Check if there's an existing contact document
        const existingContact = await Contact.findOne();

        if (existingContact) {
            // Update the existing document
            existingContact.phone = phone;
            existingContact.email = email;
            existingContact.instagramId = instagramId;
            existingContact.twitterId = twitterId;
            existingContact.facebookId = facebookId;

            const updatedContact = await existingContact.save();
            res.status(200).json(updatedContact);
        } else {
            // Create a new document
            const newContact = new Contact({
                phone,
                email,
                instagramId,
                twitterId,
                facebookId
            });

            const savedContact = await newContact.save();
            res.status(200).json(savedContact);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getContact = async (req, res) => {
    try {
        // Find the first document in the Contact collection
        const contact = await Contact.findOne();

        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }

        res.status(200).json(contact);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
