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
 *        deliveryChargeConfig:
 *          type: array
 *          items:
 *            type: object
 *            properties:
 *              minDistance:
 *                type: number
 *              maxDistance:
 *                type: number
 *              deliveryFee:
 *                type: number
 *          description: Configuration for delivery charges based on distance.
 * responses:
 * 200:
 * description: Settings updated successfully.
 * content:
 * application/json:
 * schema:
 * $ref: '#/components/schemas/Settings'
 * 400:
 * description: Bad request, vendorVisibilityRadius is required.
 * 403:
 * description: Forbidden, user is not a superadmin.
 * 500:
 * description: Internal server error.
 */
exports.updateSettings = async (req, res) => {
  try {
    const { vendorVisibilityRadius } = req.body;

    // Check if at least one field is provided
    if (vendorVisibilityRadius === undefined && !req.body.deliveryChargeConfig) {
      return res.status(400).json({
        success: false,
        message: "At least one field (vendorVisibilityRadius or deliveryChargeConfig) is required.",
      });
    }

    const updateData = {};
    if (vendorVisibilityRadius !== undefined) updateData.vendorVisibilityRadius = vendorVisibilityRadius;
    if (req.body.deliveryChargeConfig !== undefined) updateData.deliveryChargeConfig = req.body.deliveryChargeConfig;

    // Find the settings document and update it.
    // { new: true } returns the modified document.
    // { upsert: true } creates the document if it doesn't exist.
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
