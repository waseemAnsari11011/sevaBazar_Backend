const Settings = require("./model");

/**
 * @swagger
 * /api/settings:
 * get:
 * summary: Retrieve the application settings
 * tags: [Settings]
 * security:
 * - bearerAuth: []
 * responses:
 * 200:
 * description: Successfully retrieved settings.
 * content:
 * application/json:
 * schema:
 * $ref: '#/components/schemas/Settings'
 * 500:
 * description: Internal server error.
 */
exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    // If no settings document exists, create one with default values.
    if (!settings) {
      settings = await Settings.create({ vendorVisibilityRadius: 10 });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve settings.",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/settings:
 * put:
 * summary: Update the application settings (Super Admin only)
 * tags: [Settings]
 * security:
 * - bearerAuth: []
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 *        vendorVisibilityRadius:
 *          type: number
 *          description: The new visibility radius in kilometers.
 *        driverSearchRadius:
 *          type: number
 *          description: Radius to search for available drivers.
 *        driverDeliveryFee:
 *          type: object
 *          properties:
 *            basePay:
 *              type: number
 *            baseDistance:
 *              type: number
 *            perKmRate:
 *              type: number
 *          description: Configuration for delivery charges and driver payment.
 * responses:
 * 200:
 * description: Settings updated successfully.
 * 400:
 * description: Bad request.
 * 403:
 * description: Forbidden.
 */
exports.updateSettings = async (req, res) => {
  try {
    const { vendorVisibilityRadius, driverSearchRadius, driverDeliveryFee } = req.body;

    const updateData = {};
    if (vendorVisibilityRadius !== undefined) updateData.vendorVisibilityRadius = vendorVisibilityRadius;
    if (driverSearchRadius !== undefined) updateData.driverSearchRadius = driverSearchRadius;
    if (driverDeliveryFee !== undefined) updateData.driverDeliveryFee = driverDeliveryFee;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided for update.",
      });
    }

    const updatedSettings = await Settings.findOneAndUpdate(
      {},
      updateData,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Settings updated successfully.",
      data: updatedSettings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update settings.",
      error: error.message,
    });
  }
};
