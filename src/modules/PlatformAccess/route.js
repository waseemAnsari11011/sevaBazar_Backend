const express = require('express');
const { createHash, timingSafeEqual } = require('node:crypto');
const PlatformAccess = require('./model');

const digest = (value) => createHash('sha256').update(value).digest();

// A shared database record keeps the switch persistent across restarts/workers.
function createPlatformAccessRouter({ model = PlatformAccess, getSecret = () => process.env.CON_SECRET } = {}) {
    const router = express.Router();

    router.all('/platform-access/:blocked', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const secret = getSecret();
        const suppliedKey = req.get('X-Platform-Control-Key');
        if (!secret) {
            return res.status(503).json({ message: 'Platform control is not configured' });
        }
        if (!suppliedKey || !timingSafeEqual(digest(secret), digest(suppliedKey))) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        // HEAD must not inherit GET's state-changing behavior.
        if (req.method !== 'GET') {
            return res.set('Allow', 'GET').status(405).json({ message: 'Method not allowed' });
        }
        if (!['true', 'false'].includes(req.params.blocked)) {
            return res.status(400).json({ message: 'Use true to block APIs or false to enable APIs' });
        }

        const blocked = req.params.blocked === 'true';
        try {
            await model.updateOne(
                { _id: 'platform' },
                { $set: { blocked } },
                { upsert: true }
            );
            return res.json({ blocked, message: blocked ? 'Platform APIs blocked' : 'Platform APIs enabled' });
        } catch (error) {
            console.error('Unable to update platform access:', error.message);
            return res.status(503).json({ message: 'Network error' });
        }
    });

    router.use(async (req, res, next) => {
        try {
            // No local cache: the next request on every worker sees the saved state.
            const state = await model.findById('platform').lean();
            if (!state?.blocked) return next();
        } catch (error) {
            console.error('Unable to read platform access:', error.message);
        }
        return res.set('Cache-Control', 'no-store').status(503).json({ message: 'Network error' });
    });

    return router;
}

module.exports = createPlatformAccessRouter;
