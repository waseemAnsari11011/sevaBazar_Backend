const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const fs = require('fs');
if (!admin.apps.length) {
  try {
    const path = require('path');
    const configPath = path.join(__dirname, '../../../firebaseConfig.json');

    fs.appendFileSync('fcm_debug.log', `\n[${new Date().toISOString()}] Initializing Firebase Admin via path: ${configPath}\n`);

    admin.initializeApp({
      credential: admin.credential.cert(configPath),
    });
    fs.appendFileSync('fcm_debug.log', `[${new Date().toISOString()}] Firebase Admin Initialized Successfully.\n`);
  } catch (initErr) {
    fs.appendFileSync('fcm_debug.log', `[${new Date().toISOString()}] Firebase Init CRITICAL ERROR: ${initErr.message}\n`);
  }
}

const sendPushNotification = async (deviceToken, title, body, data = {}) => {
  console.log(`[FCM] Attempting to send to token: ${deviceToken?.substring(0, 10)}...`);
  if (!deviceToken || !title || !body) {
    console.warn('[FCM] Missing required fields:', { hasToken: !!deviceToken, title, body });
    throw new Error('Device token, title, and body are required');
  }

  // CRITICAL: Send ONLY data payload (no notification object)
  // This ensures Xiaomi devices don't block the message
  // and allows our app to handle wake-up logic directly
  const message = {
    data: {
      ...data,
      title: title,
      body: body,
      type: data.type || 'new_order', // Ensure type is always set
    },
    android: {
      priority: 'high',
      ttl: 3600 * 1000, // 1 hour
      // NO notification object - pure data message
    },
    token: deviceToken,
  };

  try {
    const fs = require('fs');
    const logMsg = `\n[${new Date().toISOString()}] Attempting FCM to: ${deviceToken?.substring(0, 10)}... Type: ${data.type}\n`;
    fs.appendFileSync('fcm_debug.log', logMsg);

    const response = await admin.messaging().send(message);

    const successMsg = `[${new Date().toISOString()}] FCM Success: ${response}\n`;
    fs.appendFileSync('fcm_debug.log', successMsg);

    console.log(`[FCM] Data-only message sent successfully: ${response}`);
    return `Successfully sent message: ${response}`;
  } catch (error) {
    const errorMsg = `[${new Date().toISOString()}] FCM Error: ${error.message}\n`;
    const fs = require('fs');
    fs.appendFileSync('fcm_debug.log', errorMsg);

    console.error('[FCM] Error sending message:', error);
    throw new Error('Error sending message');
  }
};

module.exports = {
  sendPushNotification,
};
