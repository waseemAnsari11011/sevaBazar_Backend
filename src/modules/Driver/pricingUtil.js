/**
 * Centralized pricing calculation logic.
 * Supports both tiered pricing and formula-based pricing.
 */

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the earth in km
    const deg2rad = (deg) => deg * (Math.PI / 180);
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
};

/**
 * Calculate delivery fee using driver payment logic
 * This ensures customer pays what driver earns (fair pricing)
 * @param {number} distance - Distance in km (vendor to customer)
 * @param {Object} settings - Settings object with driverDeliveryFee config
 * @returns {number} Delivery fee amount
 */
const calculateDeliveryFee = (distance, settings) => {
    // Use driver delivery fee settings for customer delivery charge
    const { basePay = 30, baseDistance = 5, perKmRate = 10 } = settings.driverDeliveryFee || {};

    // Calculate extra distance beyond base distance
    const extraDistance = Math.max(0, distance - baseDistance);

    // Calculate extra charge for additional distance
    const extraCharge = extraDistance * perKmRate;

    // Total fee = base pay + extra charge
    const totalFee = basePay + extraCharge;

    return totalFee;
};

/**
 * Calculate driver delivery fee based on total distance traveled
 * @param {Object} currentGeo - Driver's current location { latitude, longitude }
 * @param {Object} pickupGeo - Pickup/Vendor location { latitude, longitude }
 * @param {Object} dropGeo - Drop/Customer location { latitude, longitude }
 * @param {Object} settings - Settings object with driverDeliveryFee config
 * @returns {Object} Fee breakdown with distances and payment details
 */
const calculateDriverDeliveryFee = (currentGeo, pickupGeo, dropGeo, settings) => {
    // Calculate distance from current location to pickup
    const currentToPickup = calculateDistance(
        currentGeo.latitude,
        currentGeo.longitude,
        pickupGeo.latitude,
        pickupGeo.longitude
    );

    // Calculate distance from pickup to drop
    const pickupToDrop = calculateDistance(
        pickupGeo.latitude,
        pickupGeo.longitude,
        dropGeo.latitude,
        dropGeo.longitude
    );

    // Total distance traveled
    const totalDistance = currentToPickup + pickupToDrop;

    // Reuse the common fee calculation logic ✅
    const totalFee = calculateDeliveryFee(totalDistance, settings);

    // Get settings for breakdown details
    const { basePay = 30, baseDistance = 5, perKmRate = 10 } = settings.driverDeliveryFee || {};
    const extraDistance = Math.max(0, totalDistance - baseDistance);
    const extraPay = extraDistance * perKmRate;

    return {
        totalDistance: Number(totalDistance.toFixed(2)),
        currentToPickup: Number(currentToPickup.toFixed(2)),
        pickupToDrop: Number(pickupToDrop.toFixed(2)),
        basePay,
        extraDistance: Number(extraDistance.toFixed(2)),
        extraPay: Number(extraPay.toFixed(2)),
        totalFee: Number(totalFee.toFixed(2)),
    };
};

module.exports = {
    calculateDistance,
    calculateDeliveryFee,
    calculateDriverDeliveryFee,
};
