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
 * Internal helper to match distance against a tiered configuration array
 */
const matchTieredFee = (distance, config) => {
    if (!config || config.length === 0) return null;

    for (const condition of config) {
        if (
            (condition.conditionType === "range" && distance >= condition.minDistance && distance <= condition.maxDistance) ||
            (condition.conditionType === "greaterThan" && distance > condition.minDistance) ||
            (condition.conditionType === "lessThan" && distance < condition.maxDistance)
        ) {
            let conditionDesc = "";
            if (condition.conditionType === "range") {
                conditionDesc = `Range: ${condition.minDistance}-${condition.maxDistance} km`;
            } else if (condition.conditionType === "greaterThan") {
                conditionDesc = `Distance > ${condition.minDistance} km`;
            } else if (condition.conditionType === "lessThan") {
                conditionDesc = `Distance < ${condition.maxDistance} km`;
            }

            return {
                amount: condition.deliveryFee,
                description: `Distance: ${distance.toFixed(1)} km | ${conditionDesc}`
            };
        }
    }
    return null;
};

/**
 * Calculate delivery fee using driver payment logic
 * This ensures customer pays what driver earns (fair pricing)
 * @param {number} distance - Distance in km (vendor to customer)
 * @param {Object} settings - Settings object with driverDeliveryFee config
 * @returns {Object} { amount, description }
 */
const calculateDeliveryFee = (distance, settings) => {
    // 1. Try tiered pricing for CUSTOMERS
    const customerFee = matchTieredFee(distance, settings.deliveryChargeConfig);
    if (customerFee) return customerFee;

    // 2. Fallback to old "Fixed + Extra" logic
    const { basePay = 30, baseDistance = 5, perKmRate = 10 } = settings.driverDeliveryFee || {};

    if (distance <= baseDistance) {
        return {
            amount: basePay,
            description: `Distance: ${distance.toFixed(1)} km | Fixed (up to ${baseDistance} km)`
        };
    } else {
        const extraDistance = distance - baseDistance;
        const extraCharge = extraDistance * perKmRate;
        const total = basePay + extraCharge;

        return {
            amount: total,
            description: `Distance: ${distance.toFixed(1)} km | Fixed: ₹${basePay} + Extra: ₹${extraCharge.toFixed(2)}`
        };
    }
};

/**
 * Calculate driver payout based on total distance traveled
 */
const calculateDriverDeliveryFee = (currentGeo, pickupGeo, dropGeo, settings) => {
    const currentToPickup = calculateDistance(
        currentGeo.latitude,
        currentGeo.longitude,
        pickupGeo.latitude,
        pickupGeo.longitude
    );

    const pickupToDrop = calculateDistance(
        pickupGeo.latitude,
        pickupGeo.longitude,
        dropGeo.latitude,
        dropGeo.longitude
    );

    const totalDistance = currentToPickup + pickupToDrop;

    // 1. If Mode is 'tiered', try tiered payout first ✅
    if (settings.driverPayoutMode === 'tiered' || !settings.driverPayoutMode) {
        const driverPayout = matchTieredFee(totalDistance, settings.driverPaymentConfig);
        if (driverPayout) {
            return {
                totalDistance: Number(totalDistance.toFixed(2)),
                currentToPickup: Number(currentToPickup.toFixed(2)),
                pickupToDrop: Number(pickupToDrop.toFixed(2)),
                totalFee: driverPayout.amount,
                description: driverPayout.description
            };
        }
    }

    // 2. Fallback to Formula Mode (Base + Extra)
    const { basePay = 30, baseDistance = 5, perKmRate = 10 } = settings.driverDeliveryFee || {};

    let totalFee = basePay;
    let extraDistance = 0;
    let extraPay = 0;

    if (totalDistance > baseDistance) {
        extraDistance = totalDistance - baseDistance;
        extraPay = extraDistance * perKmRate;
        totalFee = basePay + extraPay;
    }

    return {
        totalDistance: Number(totalDistance.toFixed(2)),
        currentToPickup: Number(currentToPickup.toFixed(2)),
        pickupToDrop: Number(pickupToDrop.toFixed(2)),
        basePay: Number(basePay.toFixed(2)),
        extraDistance: Number(extraDistance.toFixed(2)),
        extraPay: Number(extraPay.toFixed(2)),
        totalFee: Number(totalFee.toFixed(2)),
        description: `Distance: ${totalDistance.toFixed(1)} km | Base: ₹${basePay} + Extra: ₹${extraPay.toFixed(2)} (${extraDistance.toFixed(1)} km extra)`
    };
};

module.exports = {
    calculateDistance,
    calculateDeliveryFee,
    calculateDriverDeliveryFee,
};
