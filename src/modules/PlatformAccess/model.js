const mongoose = require('mongoose');

const platformAccessSchema = new mongoose.Schema({
    _id: { type: String, default: 'platform' },
    blocked: { type: Boolean, default: false, required: true }
}, { timestamps: true });

module.exports = mongoose.model('PlatformAccess', platformAccessSchema);
