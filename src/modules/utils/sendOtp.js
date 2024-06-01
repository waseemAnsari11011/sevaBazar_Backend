const axios = require('axios');
require('dotenv').config();

const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY;
const GUPSHUP_SENDER_ID = process.env.GUPSHUP_SENDER_ID;

const sendOtp = async (phoneNumber, otp) => {
    const url = `https://api.gupshup.io/sm/api/v1/msg`;

    const message = `Your OTP is ${otp}`;

    try {
        const response = await axios.post(url, null, {
            params: {
                apiKey: GUPSHUP_API_KEY,
                channel: 'sms',
                source: GUPSHUP_SENDER_ID,
                destination: phoneNumber,
                message: message,
            },
        });

        if (response.data && response.data.status === 'submitted') {
            console.log('OTP sent successfully');
            return true;
        } else {
            console.error('Failed to send OTP');
            return false;
        }
    } catch (error) {
        console.error('Error sending OTP:', error);
        return false;
    }
};

module.exports = sendOtp;
