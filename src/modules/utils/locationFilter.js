const Customer = require("../Customer/model");

/**
 * Generates a MongoDB filter that includes standard vendor requirements (online, unrestricted)
 * AND location matching based on the authenticated customer's active shipping address.
 *
 * @param {object} req - The Express request object (must contain req.user.id).
 * @returns {Promise<object | null>} A MongoDB query object (merged base filter + $or location), or null if no active address is found.
 * @throws {Error} If customerId is missing or customer is not found.
 */
const createLocationFilter = async (req) => {
  // 1. Get Customer ID from authenticated request
  const customerId = req.user?.id;
  if (!customerId) {
    throw new Error("Authentication error: Customer ID not found.");
  }

  // 2. Fetch the customer
  const customer = await Customer.findById(customerId).select(
    "shippingAddresses"
  );
  if (!customer) {
    throw new Error("Customer not found.");
  }

  // 3. Find the active address
  const activeAddress = customer.shippingAddresses.find(
    (addr) => addr.isActive
  );

  if (!activeAddress) {
    console.log("No active shipping address found for customer.");
    return null;
  }

  // 4. Get latitude and longitude from active address
  const { latitude, longitude } = activeAddress;

  if (!latitude || !longitude) {
    console.log("No coordinates found in active address.");
    return null;
  }

  // 5. Build the strict location matching logic (10km radius)
  // Earth radius in km = 6378.1
  const radiusInRadians = 10 / 6378.1;

  const matchConditions = [
    {
      "location.coordinates": {
        $geoWithin: {
          $centerSphere: [[longitude, latitude], radiusInRadians],
        },
      },
    },
  ];

  // 6. Return null if no location criteria could be built (Defense in depth)
  if (matchConditions.length === 0) {
    return null;
  }

  // --- Base Filter ---
  const baseFilter = {
    isRestricted: false,
  };

  // 7. Return merged filter: Base requirements + Location
  // Note: We use $and here implicitly by merging properties, or we can just return the object.
  // Previous logic used $or for postal codes. Here we have a single geospatial condition.
  return {
    ...baseFilter,
    ...matchConditions[0], // Spread the geo query directly
  };
};

module.exports = createLocationFilter;
