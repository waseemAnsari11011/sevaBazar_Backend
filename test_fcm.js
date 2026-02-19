const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'firebaseConfig.json');
const logFile = 'fcm_test.log';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
}

async function testFirebase() {
    try {
        log('Starting Standalone Firebase Test...');

        if (!fs.existsSync(configPath)) {
            log('ERROR: firebaseConfig.json not found!');
            return;
        }

        const serviceAccount = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        log(`Project ID: ${serviceAccount.project_id}`);
        log(`Client Email: ${serviceAccount.client_email}`);

        let privateKey = serviceAccount.private_key;
        if (privateKey.includes('\\n')) {
            log('Detected escaped newlines. Normalizing...');
            privateKey = privateKey.replace(/\\n/g, '\n');
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: serviceAccount.project_id,
                clientEmail: serviceAccount.client_email,
                privateKey: privateKey,
            }),
        });

        log('SDK Initialized. Attempting to send a dummy message (dryRun)...');

        const message = {
            data: { test: 'true' },
            token: 'dummy-token-123', // This will fail with 'not found', but only AFTER auth succeeds
        };

        try {
            // dryRun: true means it won't actually send, just validates everything (including credentials)
            await admin.messaging().send(message, true);
            log('SUCCESS (Unexpected)! Dry run succeeded.');
        } catch (sendError) {
            if (sendError.code === 'messaging/registration-token-not-registered' ||
                sendError.message.includes('Requested entity was not found')) {
                log('SUCCESS! Credentials are VALID (Auth succeeded, but token was invalid as expected).');
            } else {
                log(`FAILURE: ${sendError.message}`);
                log(`Code: ${sendError.code}`);
            }
        }

    } catch (error) {
        log(`CRITICAL FAILURE: ${error.message}`);
        if (error.stack) log(error.stack);
    }
}

testFirebase();
