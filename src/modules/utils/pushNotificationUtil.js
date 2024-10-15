const admin = require("firebase-admin");
const serviceAccount = require("../../../firebaseConfig.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const sendPushNotification = async (deviceToken, title, body) => {
  console.log("running notification");
  if (!deviceToken || !title || !body) {
    throw new Error("Device token, title, and body are required");
  }

  console.log("deviceToken===>>>", deviceToken);

  const message = {
    notification: {
      title: title,
      body: body,
    },
    android: {
      notification: {
        sound: "happy_bell.wav", // Set custom sound for Android
        channel_id: "sound_channel", // Set the correct Android channel ID
      },
    },
    token: deviceToken,
  };

  try {
    const response = await admin.messaging().send(message);
    return `Successfully sent message: ${response}`;
  } catch (error) {
    console.error("Error sending message:", error);
    throw new Error("Error sending message");
  }
};

module.exports = {
  sendPushNotification,
};
