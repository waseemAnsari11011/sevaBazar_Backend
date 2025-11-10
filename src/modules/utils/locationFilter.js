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

  // 4. Prepare address tokens and postal code
  const { landmark, address, city, state, country, postalCode } = activeAddress;
  const fullAddressString = [landmark, address, city, state, country]
    .filter(Boolean)
    .join(" ");

  const addressTokens = [
    ...new Set(
      fullAddressString
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean)
    ),
  ];

  // 5. Build the core location matching logic
  const matchConditions = [];

  // Condition A: Match postal code
  if (postalCode) {
    matchConditions.push({ "location.address.postalCode": postalCode });
    matchConditions.push({ "location.address.postalCodes": postalCode });
  }

  // Condition B: Match address tokens
  if (addressTokens.length > 0) {
    const addressRegex = new RegExp(addressTokens.join("|"), "i");
    matchConditions.push({ "location.address.addressLine1": addressRegex });
    matchConditions.push({ "location.address.addressLine2": addressRegex });
    matchConditions.push({ "location.address.landmark": addressRegex });
  }

  // 6. Return null if no location criteria could be built
  if (matchConditions.length === 0) {
    return null;
  }

  // --- ADDED: Base Filter ---
  // This ensures we only ever return vendors that are playable.
  const baseFilter = {
    status: "online",
    isRestricted: false,
  };

  // 7. Return merged filter: Base requirements + Location ($or)
  return {
    ...baseFilter,
    $or: matchConditions,
  };
};

module.exports = createLocationFilter;
