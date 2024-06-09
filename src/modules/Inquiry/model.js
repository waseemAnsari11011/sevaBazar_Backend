const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const inquirySchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    response: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'responded'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    respondedAt: {
        type: Date
    }
});

module.exports = mongoose.model('Inquiry', inquirySchema);
