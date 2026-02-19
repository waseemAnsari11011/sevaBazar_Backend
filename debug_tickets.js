const mongoose = require('mongoose');
require('dotenv').config();

const ticketSchema = new mongoose.Schema({
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    userType: String,
}, { strict: false });

const Ticket = mongoose.model('Ticket', ticketSchema);

async function checkTickets() {
    try {
        const mongoUri = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

        await mongoose.connect(mongoUri);
        console.log('Connected');

        const ticket = await Ticket.findOne();
        if (!ticket) {
            console.log('NO_TICKETS_IN_DB');
        } else {
            console.log('TICKET_FOUND:');
            console.log(JSON.stringify(ticket, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error('ERROR:', err);
        process.exit(1);
    }
}

checkTickets();
