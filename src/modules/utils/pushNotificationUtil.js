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

  const criticalTypes = ['new_order', 'NEW_ORDER_ALERT', 'delivery_order', 'new_order_offer'];
  const isCriticalAlert = criticalTypes.includes(data.type);

  const message = {
    // For critical alerts, we do NOT include the 'notification' property.
    // This makes it a "Data-Only" message, which ensures the Android system 
    // does not show a default notification and instead delivers it directly 
    // to our FCMWakeUpService.kt while the app is in background/killed.
    ...(!isCriticalAlert && {
      notification: {
        title: title,
        body: body,
      }
    }),
    data: {
      ...data,
      title: title,
      body: body,
      type: data.type || 'new_order',
    },
    android: {
      priority: 'high',
      ttl: 3600 * 1000, // 1 hour
    },
    token: deviceToken,
  };

  // For critical alerts, we rely entirely on the data payload and our custom Native Service (FCMWakeUpService.kt)
  // to avoid system-generated notifications that cannot be targeted for specific dismissal.
  // The high priority ensures the data message is delivered immediately even in Doze mode.

  try {
    const fs = require('fs');
    const logMsg = `\n[${new Date().toISOString()}] Attempting FCM to: ${deviceToken?.substring(0, 10)}... Type: ${data.type} (Critical: ${isCriticalAlert})\n`;
    fs.appendFileSync('fcm_debug.log', logMsg);

    const response = await admin.messaging().send(message);

    const successMsg = `[${new Date().toISOString()}] FCM Success: ${response}\n`;
    fs.appendFileSync('fcm_debug.log', successMsg);

    console.log(`[FCM] Message sent successfully: ${response} (Mode: ${isCriticalAlert ? 'Notification+Data' : 'Data-only'})`);
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
