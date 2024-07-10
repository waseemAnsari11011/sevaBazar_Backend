const admin = require('firebase-admin');
const serviceAccount = require('../../../firebaseConfig.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const sendPushNotification = async (deviceToken, title, body) => {
  if (!deviceToken || !title || !body) {
    throw new Error('Device token, title, and body are required');
  }

  const message = {
    notification: {
      title: title,
      body: body,
    },
    token: deviceToken,
  };

  try {
    const response = await admin.messaging().send(message);
    return `Successfully sent message: ${response}`;
  } catch (error) {
    console.error('Error sending message:', error);
    throw new Error('Error sending message');
  }
};

module.exports = {
  sendPushNotification,
};
