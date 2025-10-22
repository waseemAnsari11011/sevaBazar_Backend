const Customer = require("../Customer/model");

/**
 * Generates a MongoDB location filter based on the authenticated customer's active shipping address.
 * @param {object} req - The Express request object (must contain req.user.id).
 * @returns {Promise<object | null>} A MongoDB query object (e.g., { $or: [...] }), or null if no active address is found or no address parts can be used.
 * @throws {Error} If customerId is missing or customer is not found, allowing the controller to handle HTTP responses.
 */
const createLocationFilter = async (req) => {
  // 1. Get Customer ID from authenticated request
  const customerId = req.user?.id;
  if (!customerId) {
    // This will be caught by the controller's try/catch
    throw new Error("Authentication error: Customer ID not found.");
  }

  // 2. Fetch the customer
  const customer = await Customer.findById(customerId).select(
    "shippingAddresses"
  );
  if (!customer) {
    // This will also be caught
    throw new Error("Customer not found.");
  }

  // 3. Find the active address
  const activeAddress = customer.shippingAddresses.find(
    (addr) => addr.isActive
  );

  if (!activeAddress) {
    console.log("No active shipping address found for customer.");
    return null; // No location to filter by
  }

  // 4. Prepare address tokens and postal code
  const { landmark, address, city, state, country, postalCode } = activeAddress;
  const fullAddressString = [landmark, address, city, state, country]
    .filter(Boolean) // Remove any null/undefined parts
    .join(" ");

  const addressTokens = [
    ...new Set(
      fullAddressString
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean)
    ),
  ];

  // 5. Build the core matching logic
  const matchConditions = [];

  // Condition A: Match the vendor's postal code
  if (postalCode) {
    matchConditions.push({ "location.address.postalCode": postalCode });
    // Also check against the array of postal codes the vendor serves
    matchConditions.push({ "location.address.postalCodes": postalCode });
  }

  // Condition B: Match any of the address words in the vendor's address fields
  if (addressTokens.length > 0) {
    const addressRegex = new RegExp(addressTokens.join("|"), "i");
    matchConditions.push({ "location.address.addressLine1": addressRegex });
    matchConditions.push({ "location.address.addressLine2": addressRegex });
    matchConditions.push({ "location.address.landmark": addressRegex });
  }

  // 6. Return the filter or null
  if (matchConditions.length === 0) {
    return null; // No valid address parts to filter on
  }

  return { $or: matchConditions };
};

module.exports = createLocationFilter;
