const cron = require('node-cron');
const Vendor = require('../modules/Vendor/model');

// Extracted unblock logic as a reusable function
const runUnblockJob = async () => {
    console.log('Running vendor unblock job...');
    try {
        // 1. Unblock blocked vendors
        const unblockResult = await Vendor.updateMany(
            { isBlocked: true },
            {
                $set: {
                    isBlocked: false,
                    rejectionCount: 0,
                    lastRejectionResetDate: new Date()
                },
                $unset: { blockedAt: 1 }
            }
        );
        console.log(`Unblocked ${unblockResult.modifiedCount} vendors.`);

        // 2. Reset rejection count for ALL vendors (even if not blocked)
        const resetResult = await Vendor.updateMany(
            {}, // All vendors
            {
                $set: {
                    rejectionCount: 0,
                    lastRejectionResetDate: new Date()
                }
            }
        );
        console.log(`Reset rejection count for ${resetResult.modifiedCount} vendors.`);

    } catch (error) {
        console.error('Error in vendor unblock job:', error);
    }
};

const initCronJobs = () => {
    // Schedule task to run at 12:00 AM IST daily (18:30 UTC)
    // IST = UTC+5:30. Midnight IST = 18:30 UTC previous day.
    // Cron schedule: 30 18 * * * (At 18:30)

    console.log('Initializing cron jobs...');

    // Run unblock job on startup to catch any missed unblocks
    console.log('Running startup vendor unblock check...');
    runUnblockJob();

    // Schedule daily unblock at midnight IST
    cron.schedule('30 18 * * *', async () => {
        console.log('Running scheduled nightly vendor unblock job (12:00 AM IST)...');
        await runUnblockJob();
    }, {
        scheduled: true,
        timezone: "UTC" // Using UTC for consistency
    });
};

module.exports = initCronJobs;
