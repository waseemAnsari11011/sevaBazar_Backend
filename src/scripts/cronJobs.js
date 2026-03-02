const cron = require('node-cron');
const Vendor = require('../modules/Vendor/model');
const Driver = require('../modules/Driver/model');

// ===== Vendor Unblock Logic =====
const runVendorUnblockJob = async () => {
    console.log('Running vendor unblock job...');
    try {
        const unblockResult = await Vendor.updateMany(
            { isBlocked: true },
            {
                $set: { isBlocked: false, rejectionCount: 0, lastRejectionResetDate: new Date() },
                $unset: { blockedAt: 1 }
            }
        );
        console.log(`Unblocked ${unblockResult.modifiedCount} vendors.`);

        const resetResult = await Vendor.updateMany(
            {},
            { $set: { rejectionCount: 0, lastRejectionResetDate: new Date() } }
        );
        console.log(`Reset rejection count for ${resetResult.modifiedCount} vendors.`);
    } catch (error) {
        console.error('Error in vendor unblock job:', error);
    }
};

// ===== Driver Unblock Logic =====
const runDriverUnblockJob = async () => {
    console.log('Running driver unblock job...');
    try {
        const OrderAssignment = require('../modules/Driver/orderAssignment.model');

        // First collect IDs of currently blocked drivers
        const blockedDrivers = await Driver.find({ isBlocked: true }, '_id');
        const blockedIds = blockedDrivers.map(d => d._id);

        if (blockedIds.length > 0) {
            // Clear their rejected assignments (so Rejected tab is empty after unblock)
            const cleared = await OrderAssignment.deleteMany({ driverId: { $in: blockedIds }, status: 'rejected' });
            console.log(`[CRON] Cleared rejected assignments for ${cleared.deletedCount} records.`);
        }

        // Now unblock all blocked drivers
        const unblockResult = await Driver.updateMany(
            { isBlocked: true },
            {
                $set: {
                    isBlocked: false,
                    rejectionCount: 0,
                    blockedAt: null,
                    lastRejectionResetAt: new Date(),
                }
            }
        );
        console.log(`[CRON] Auto-unblocked ${unblockResult.modifiedCount} drivers at midnight IST.`);

        // Also reset rejection count for all non-blocked drivers
        await Driver.updateMany(
            { isBlocked: false, rejectionCount: { $gt: 0 } },
            { $set: { rejectionCount: 0, lastRejectionResetAt: new Date() } }
        );
    } catch (error) {
        console.error('Error in driver unblock job:', error);
    }
};

const initCronJobs = () => {
    console.log('Initializing cron jobs...');

    // Run on startup to catch any missed unblocks
    // runVendorUnblockJob();
    // runDriverUnblockJob();

    // Schedule daily unblock at midnight IST (18:30 UTC)
    cron.schedule('30 18 * * *', async () => {
        console.log('[CRON] Running scheduled nightly unblock job (12:00 AM IST)...');
        await runVendorUnblockJob();
        await runDriverUnblockJob();
    }, {
        scheduled: true,
        timezone: "UTC"
    });
};

module.exports = initCronJobs;
