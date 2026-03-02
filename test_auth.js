const admin = require('firebase-admin');

async function testAuth() {
    try {
        const serviceAccount = require('./firebaseConfig.json');
        console.log('Testing New Key for Project:', serviceAccount.project_id);

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }

        console.log('Attempting to fetch access token...');
        const credential = admin.app().options.credential;
        const accessToken = await credential.getAccessToken();
        console.log('SUCCESS! Access token fetched:', accessToken.access_token.substring(0, 10) + '...');
    } catch (error) {
        console.error('--- AUTH ERROR WITH NEW KEY ---');
        console.error('Message:', error.message);
    }
}

testAuth();
