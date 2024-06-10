// model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const contactSchema = new Schema({
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  instagramId: {
    type: String,
    required: false
  },
  twitterId: {
    type: String,
    required: false
  },
  facebookId: {
    type: String,
    required: false
  }
}, {
  timestamps: true // This will add createdAt and updatedAt timestamps
});

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;
