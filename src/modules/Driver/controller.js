const Driver = require("./model");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const Settings = require("../Settings/model");
const Customer = require('../Customer/model');
const { sendPushNotification } = require('../utils/pushNotificationUtil');
const { calculateDistance, calculateDeliveryFee } = require('../Driver/pricingUtil');

// Helper to enrich order items with images and calculate total for driver
const enrichItemsAndTotal = (orderData, isChatOrder) => {
    const rawItems = isChatOrder ? (orderData.products || []) : (orderData.vendors?.[0]?.products || []);

    // Enrich items with images
    const items = rawItems.map(item => {
        let image = null;
        const itemObj = item.toObject ? item.toObject() : item;

        if (itemObj.variations && itemObj.variations.length > 0) {
            // Find first variation with images. Variations in the order doc are often simplified
            // so we check both top-level and variations array.
            const varWithImage = itemObj.variations.find(v => v.images && v.images.length > 0);
            if (varWithImage) {
                image = varWithImage.images[0];
            }
        }

        // Fallback for chat orders or simple products if image is directly on the item
        if (!image && itemObj.image) {
            image = itemObj.image;
        }

        return {
            ...itemObj,
            image
        };
    });

    // Calculate total bill for the driver (specific to their pickup)
    let totalAmount = 0;
    let shippingFee = 0;
    let deliveryCharge = 0;

    if (isChatOrder) {
        totalAmount = (orderData.totalAmount || 0);
        shippingFee = (orderData.shippingFee || 0);
        deliveryCharge = (orderData.deliveryCharge || 0);
        totalAmount += shippingFee + deliveryCharge;
    } else {
        const vendorPart = orderData.vendors?.[0];
        if (vendorPart) {
            totalAmount = (vendorPart.products || []).reduce((sum, p) => sum + (p.totalAmount || (p.price * p.quantity)), 0);
            deliveryCharge = (vendorPart.deliveryCharge || 0);
            shippingFee = (orderData.shippingFee || 0);
            totalAmount += deliveryCharge + shippingFee;
        }
    }

    return { items, totalAmount: Number(totalAmount.toFixed(2)), shippingFee, deliveryCharge };
};

const secret = process.env.JWT_SECRET;

exports.createDriver = async (req, res) => {
    try {
        let { personalDetails, vehicleDetails } = req.body;

        // Parse JSON strings if they come from FormData
        if (typeof personalDetails === "string") personalDetails = JSON.parse(personalDetails);
        if (typeof vehicleDetails === "string") vehicleDetails = JSON.parse(vehicleDetails);

        // Get uploaded file URLs from s3UploadMiddleware
        const documents = req.files ? req.files.map((file) => file.location) : [];

        // Check if driver already exists
        const existingDriver = await Driver.findOne({
            "personalDetails.phone": personalDetails.phone,
        });
        if (existingDriver) {
            console.log(`Attempted to create driver with existing phone number: ${personalDetails.phone}`);
            return res.status(400).json({ message: "Driver with this phone number already exists." });
        }

        const driver = new Driver({
            personalDetails,
            vehicleDetails,
            documents,
            approvalStatus: req.user && req.user.role === 'admin' ? 'approved' : 'suspended'
        });

        await driver.save();
        console.log(`New driver created with ID: ${driver._id} and approval status: ${driver.approvalStatus}`);

        res.status(201).json({
            message: "Driver created successfully",
            driverId: driver._id,
        });
    } catch (error) {
        console.error("Error creating driver:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

exports.driverLogin = async (req, res) => {
    try {
        const { phone, password, deviceToken, deviceType } = req.body;

        const driver = await Driver.findOne({ "personalDetails.phone": phone });
        if (!driver) {
            return res.status(401).json({ message: "Invalid phone number or password." });
        }

        const isMatch = await driver.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid phone number or password." });
        }

        if (driver.approvalStatus === "suspended") {
            return res.status(403).json({ message: "Your account is suspended. Please contact admin." });
        }

        const token = jwt.sign(
            { id: driver._id, role: driver.role },
            secret,
            { expiresIn: "7d" }
        );

        // Set driver online status to true upon successful login and save device info
        await Driver.findByIdAndUpdate(driver._id, {
            isOnline: true,
            deviceToken: deviceToken || driver.deviceToken,
            deviceType: deviceType || driver.deviceType
        });

        res.status(200).json({
            message: "Login successful",
            token,
            driver: {
                _id: driver._id,
                name: driver.personalDetails.name,
                phone: driver.personalDetails.phone,
                role: driver.role,
                isOnline: true, // Echo back the status
                deviceToken: deviceToken || driver.deviceToken,
            },
        });
    } catch (error) {
        console.error("Error during driver login:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

exports.getAllDrivers = async (req, res) => {
    try {
        const drivers = await Driver.find().sort({ createdAt: -1 });
        res.status(200).json(drivers);
    } catch (error) {
        console.error("Error fetching drivers:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};
exports.updateDriverStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["approved", "suspended"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const driver = await Driver.findByIdAndUpdate(
            id,
            { approvalStatus: status },
            { new: true }
        );

        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        res.status(200).json({
            message: `Driver status updated to ${status}`,
            driver,
        });
    } catch (error) {
        console.error("Error updating driver status:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

exports.updateOnlineStatus = async (req, res) => {
    try {
        const { isOnline } = req.body;
        const driverId = req.user.id;

        const driver = await Driver.findByIdAndUpdate(
            driverId,
            { isOnline },
            { new: true }
        );

        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        res.status(200).json({
            message: `Driver is now ${isOnline ? "online" : "offline"}`,
            isOnline: driver.isOnline,
        });
    } catch (error) {
        console.error("Error updating online status:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};


exports.updateLocation = async (req, res) => {
    try {
        const { latitude, longitude, address } = req.body;
        const driverId = req.user.id;

        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ message: "Latitude and longitude are required" });
        }

        const driver = await Driver.findByIdAndUpdate(
            driverId,
            {
                currentLocation: {
                    type: "Point",
                    coordinates: [longitude, latitude],
                    address: address || "",
                },
            },
            { new: true }
        );

        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        res.status(200).json({
            message: "Location updated successfully",
            currentLocation: driver.currentLocation,
        });
    } catch (error) {
        console.error("Error updating location:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

exports.findNearestDrivers = async (req, res) => {
    try {
        let isInternal = false;
        let vendorId, searchLat, searchLon, searchRadius, orderId;

        // Context Detection: Handle internal calls
        if (!res || typeof res.status !== 'function') {
            isInternal = true;
            if (typeof req === 'object') {
                vendorId = req.vendorId;
                orderId = req.orderId;
            } else {
                vendorId = req;
            }
        } else {
            // API Call from Mobile App
            const { vendorLocation, radius, orderId: oid } = req.body;
            searchLat = vendorLocation?.latitude || req.body.latitude;
            searchLon = vendorLocation?.longitude || req.body.longitude;
            searchRadius = radius;
            orderId = oid;
            vendorId = req.body.vendorId;
        }

        // Logic to resolve vendor coordinates if missing (for internal calls or missing coordinates in API)
        if (vendorId && (searchLat === undefined || searchLon === undefined)) {
            const Vendor = require('../Vendor/model');
            const vendor = await Vendor.findById(vendorId);
            if (vendor && vendor.location?.coordinates) {
                searchLon = vendor.location.coordinates[0];
                searchLat = vendor.location.coordinates[1];
            }
        }

        if (searchLat === undefined || searchLon === undefined) {
            if (isInternal) return [];
            return res.status(400).json({
                message: "Vendor location (latitude/longitude) is required."
            });
        }


        const { calculateDistance } = require("./pricingUtil");
        const Settings = require("../Settings/model");
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({ vendorVisibilityRadius: 10, driverSearchRadius: 5 });
        }


        const finalRadius = searchRadius || 10;
        const radiusInMeters = finalRadius * 1000;

        const drivers = await Driver.aggregate([
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [parseFloat(searchLon), parseFloat(searchLat)],
                    },
                    distanceField: "distanceFromVendor",
                    maxDistance: radiusInMeters,
                    query: {
                        approvalStatus: "approved",
                        isOnline: true,
                        currentOrderId: null,
                    },
                    spherical: true,
                },
            }
        ]);

        const results = drivers.map(d => ({
            id: d._id,
            name: d.personalDetails.name,
            phone: d.personalDetails.phone,
            location: d.currentLocation,
            distance: Number((d.distanceFromVendor / 1000).toFixed(2)),
            status: {
                isOnline: d.isOnline,
                approvalStatus: d.approvalStatus,
                isFree: d.currentOrderId === null
            },
            deviceToken: d.deviceToken
        }));

        // Resolve DB ObjectId and fetch ORDER DETAILS for full notification
        let dbOrderId = null;
        let orderData = null;
        let isChatOrder = false;
        if (orderId) {
            try {
                const Order = require('../Order/model');
                // Use .lean() for performance and ensure vendors.vendor and customer is populated
                orderData = await Order.findOne(mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId: orderId })
                    .populate('vendors.vendor')
                    .populate('customer', 'name contactNumber');

                if (orderData) {
                    dbOrderId = orderData._id;
                } else {
                    // Try ChatOrder
                    const ChatOrder = require('../ChatOrdrer/model');
                    orderData = await ChatOrder.findOne(mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId: orderId })
                        .populate('vendor')
                        .populate('customer', 'name contactNumber');
                    if (orderData) {
                        dbOrderId = orderData._id;
                        isChatOrder = true;
                    }
                }
            } catch (err) {
                console.error("[findNearestDrivers] Order lookup error:", err.message);
            }
        }

        // Trigger Socket Event to found drivers
        if (results.length > 0) {
            console.log(`[SOCKET] Found ${results.length} drivers: ${results.map(d => d.name).join(', ')}`);
            const io = (req && req.app) ? req.app.get("io") : null;
            const OrderAssignment = require('./orderAssignment.model');

            // Construct full offer data if possible
            let fullOfferData = {
                orderId: orderId,
                distance: 0 // Will be overridden for each driver
            };

            if (orderData) {
                const firstVendor = isChatOrder ? orderData.vendor : orderData.vendors[0]?.vendor;
                // Extract fee info safely
                const shippingFee = orderData.shippingFee || 0;
                const deliveryCharge = isChatOrder ? 0 : (orderData.vendors?.[0]?.deliveryCharge || 0);

                fullOfferData = {
                    ...fullOfferData,
                    pickupLocation: firstVendor?.location?.coordinates ? {
                        latitude: firstVendor.location.coordinates[1],
                        longitude: firstVendor.location.coordinates[0]
                    } : null,
                    vendorName: firstVendor?.name || 'Vendor',
                    vendorAddress: firstVendor?.location?.address ?
                        (typeof firstVendor.location.address === 'string' ? firstVendor.location.address : `${firstVendor.location.address.addressLine1 || ''}, ${firstVendor.location.address.city || ''}`) :
                        'Vendor Address',
                    dropLocation: orderData.shippingAddress?.latitude ? {
                        latitude: orderData.shippingAddress.latitude,
                        longitude: orderData.shippingAddress.longitude
                    } : null,
                    // Extra info for direct display
                    shippingAddress: orderData.shippingAddress,
                    customerName: orderData.shippingAddress?.name || orderData.customer?.name || orderData.name,
                    customerPhone: orderData.shippingAddress?.phone || orderData.customer?.contactNumber,
                    ...enrichItemsAndTotal(orderData, isChatOrder),
                    shippingFee,
                    deliveryCharge,
                    createdAt: orderData.createdAt
                };
            }

            const { calculateDriverDeliveryFee } = require('./pricingUtil');

            // Helper to normalize location format
            const normalizeLocation = (loc) => {
                if (!loc) return null;
                if (loc.latitude !== undefined && loc.longitude !== undefined) return loc;
                if (loc.coordinates && loc.coordinates.length === 2) {
                    return {
                        latitude: loc.coordinates[1],
                        longitude: loc.coordinates[0]
                    };
                }
                // Handle case where location might be just the coordinates array
                if (Array.isArray(loc) && loc.length === 2) {
                    return { latitude: loc[1], longitude: loc[0] };
                }
                return loc;
            };

            for (const driver of results) {
                const roomId = driver.id.toString();

                let driverEarning = 0;
                let driverTotalDistance = driver.distance; // Default to just driver->vendor

                const finalDriverLoc = normalizeLocation(driver.location);

                // Calculate full fee if we have pickup/drop locations
                if (fullOfferData.pickupLocation && fullOfferData.dropLocation && finalDriverLoc) {
                    const feeDetails = calculateDriverDeliveryFee(
                        finalDriverLoc,
                        fullOfferData.pickupLocation,
                        fullOfferData.dropLocation,
                        settings
                    );
                    driverEarning = feeDetails.totalFee;
                    driverTotalDistance = feeDetails.totalDistance;
                }

                // Save assignment to DB for persistence IF we have the DB ID
                if (dbOrderId) {
                    try {
                        await OrderAssignment.findOneAndUpdate(
                            { orderId: dbOrderId, driverId: driver.id },
                            {
                                orderId: dbOrderId,
                                driverId: driver.id,
                                distance: driver.distance, // driver to vendor
                                totalDistance: driverTotalDistance, // driver -> vendor -> customer
                                earning: driverEarning,
                                status: 'pending'
                            },
                            { upsert: true, new: true }
                        );
                        console.log(`[PERSIST] Offer saved for driver ${driver.name} | Order #${orderId} | Earning: ₹${driverEarning}`);
                    } catch (err) {
                        console.error("[PERSIST] OrderAssignment save error:", err.message);
                    }
                }

                if (io) {
                    io.to(roomId).emit("new_order_offer", {
                        ...fullOfferData,
                        distance: driver.distance,
                        totalDistance: driverTotalDistance,
                        earning: driverEarning
                    });
                }

                // Send Push Notification for Ringtone/Background wake-up
                console.log(`[PUSH] Checking token for ${driver.name}: ${driver.deviceToken || 'No Token'}`);
                if (driver.deviceToken) {
                    try {
                        const pushTitle = "New Order Available! 📦";
                        const pushBody = `New order from ${fullOfferData.vendorName}. Earning: ₹${driverEarning}`;
                        const pushData = {
                            type: 'new_order',
                            orderId: orderId.toString(),
                            earning: driverEarning.toString(),
                            vendorName: fullOfferData.vendorName || 'Vendor',
                            pickupLocation: JSON.stringify(fullOfferData.pickupLocation),
                            dropLocation: JSON.stringify(fullOfferData.dropLocation)
                        };
                        sendPushNotification(driver.deviceToken, pushTitle, pushBody, pushData)
                            .then(res => console.log(`[PUSH] Success for ${driver.name}:`, res))
                            .catch(err => console.error(`[PUSH] Send Error for ${driver.name}:`, err.message));
                    } catch (pushErr) {
                        console.error("[PUSH] Prep Error:", pushErr.message);
                    }
                }
            }
        }

        if (isInternal) return results.map(d => d.id);

        res.status(200).json({
            success: true,
            count: results.length,
            radiusUsed: finalRadius,
            drivers: results,
        });
    } catch (error) {
        console.error("Error finding nearest drivers:", error);
        if (isInternal) return [];
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

const Vendor = require("../Vendor/model");

// Unified delivery charge calculation endpoint
exports.calculateDriverFee = async (req, res) => {
    console.log("[DEBUG] calculateDriverFee called with body:", JSON.stringify(req.body, null, 2));
    try {
        const {
            currentLocation,
            pickupLocation,
            dropLocation,
            vendors,
            shippingAddress
        } = req.body;

        // Helper to normalize location format (handle {latitude, longitude} and {coordinates: [lon, lat]})
        const normalizeLocation = (loc) => {
            if (!loc) return null;
            if (loc.latitude !== undefined && loc.longitude !== undefined) return loc;
            if (loc.coordinates && loc.coordinates.length === 2) {
                return {
                    latitude: loc.coordinates[1],
                    longitude: loc.coordinates[0]
                };
            }
            return loc;
        };

        // Fetch settings
        const Settings = require("../Settings/model");
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({ vendorVisibilityRadius: 10 });
        }

        const { calculateDistance, calculateDeliveryFee, calculateDriverDeliveryFee } = require("./pricingUtil");

        // NEW FORMAT (from Customer App): vendors array and shippingAddress
        if (vendors && Array.isArray(vendors) && shippingAddress) {
            const finalShipping = normalizeLocation(shippingAddress);
            if (!finalShipping?.latitude || !finalShipping?.longitude) {
                return res.status(400).json({ error: "Shipping address must have latitude and longitude" });
            }

            const charges = [];
            let totalDeliveryCharge = 0;

            for (const vendorId of vendors) {
                const vendor = await Vendor.findById(vendorId);
                if (!vendor || !vendor.location || !vendor.location.coordinates) {
                    console.log(`Vendor ${vendorId} not found or has no location`);
                    continue;
                }

                const distance = calculateDistance(
                    vendor.location.coordinates[1], // latitude
                    vendor.location.coordinates[0], // longitude
                    finalShipping.latitude,
                    finalShipping.longitude
                );

                const feetData = calculateDeliveryFee(distance, settings);
                const charge = feetData.amount;

                charges.push({
                    vendorId,
                    vendorName: vendor.name,
                    distance: Number(distance.toFixed(2)),
                    charge: Number(charge.toFixed(2)),
                    description: feetData.description
                });

                totalDeliveryCharge += charge;
            }

            return res.status(200).json({
                success: true,
                totalDeliveryCharge: Number(totalDeliveryCharge.toFixed(2)),
                charges
            });
        }

        // DRIVER EARNINGS FORMAT: 3 locations provided (currentLocation, pickupLocation, dropLocation)
        const finalCurrent = normalizeLocation(currentLocation);
        const finalPickup = normalizeLocation(pickupLocation);
        const finalDrop = normalizeLocation(dropLocation);

        if (finalCurrent && finalPickup && finalDrop) {
            console.log("[DEBUG] Calculating Driver Delivery Fee with normalized locations:", {
                finalCurrent, finalPickup, finalDrop
            });
            // Validate input (check strict undefined/null to allow 0,0 coordinates)
            if (finalCurrent.latitude === undefined || finalCurrent.latitude === null ||
                finalCurrent.longitude === undefined || finalCurrent.longitude === null ||
                finalPickup.latitude === undefined || finalPickup.latitude === null ||
                finalPickup.longitude === undefined || finalPickup.longitude === null ||
                finalDrop.latitude === undefined || finalDrop.latitude === null ||
                finalDrop.longitude === undefined || finalDrop.longitude === null) {
                return res.status(400).json({
                    error: "Each location must have valid latitude and longitude"
                });
            }

            // Calculate driver delivery fee
            const feeBreakdown = calculateDriverDeliveryFee(
                finalCurrent,
                finalPickup,
                finalDrop,
                settings
            );

            return res.status(200).json({
                success: true,
                ...feeBreakdown,
                settings: {
                    basePay: settings.driverDeliveryFee?.basePay || 30,
                    baseDistance: settings.driverDeliveryFee?.baseDistance || 5,
                    perKmRate: settings.driverDeliveryFee?.perKmRate || 10
                }
            });
        }

        // Invalid format provided
        return res.status(400).json({
            error: "Invalid request format. Provide vendors/shippingAddress or currentLocation/pickupLocation/dropLocation"
        });

    } catch (error) {
        console.error("[DEBUG] Error calculating delivery fee:", error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
};

exports.verifyPickup = async (req, res) => {
    try {
        const { orderId, pickupOtp, driverId } = req.body;

        if (!orderId || !pickupOtp || !driverId) {
            return res.status(400).json({
                success: false,
                message: 'orderId, pickupOtp, and driverId are required'
            });
        }

        // Find the order
        const Order = require('../Order/model');
        const ChatOrder = require('../ChatOrdrer/model');
        let order = await Order.findOne({ orderId: orderId });
        let isChatOrder = false;

        if (!order) {
            order = await ChatOrder.findOne({ orderId: orderId });
            if (order) isChatOrder = true;
        }

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify driver is assigned to this order
        if (order.driverId.toString() !== driverId) {
            return res.status(403).json({
                success: false,
                message: 'You are not assigned to this order'
            });
        }

        // Verify OTP
        if (Number(pickupOtp) !== order.pickupOtp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pickup OTP'
            });
        }

        // Generate 4 digit Delivery OTP
        const deliveryOtp = Math.floor(1000 + Math.random() * 9000);

        // Update order status to 'Shipped' (Out for Delivery), set deliveryOtp, and set arrivalAt
        const deliveryTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

        if (isChatOrder) {
            order.orderStatus = 'Shipped';
            order.arrivalAt = deliveryTime;
        } else {
            order.vendors.forEach(vendor => {
                vendor.orderStatus = 'Shipped';
                vendor.products.forEach(product => {
                    product.arrivalAt = deliveryTime;
                });
            });
        }
        order.deliveryOtp = deliveryOtp;

        await order.save();

        // Send push notification to customer
        const customer = await Customer.findById(order.customer);
        if (customer && customer.fcmDeviceToken) {
            const title = 'Order Out for Delivery';
            const body = `Your order ${orderId} is out for delivery. Use OTP ${deliveryOtp} to receive it.`;
            try {
                await sendPushNotification(customer.fcmDeviceToken, title, body);
            } catch (err) {
                console.error('Error sending pickup notification:', err);
            }
        }

        console.log(`\n************************************`);
        console.log(`[AUTO DELIVERY OTP] Order: ${orderId}`);
        console.log(`[AUTO DELIVERY OTP] OTP Generated: ${deliveryOtp}`);
        console.log(`************************************\n`);

        res.status(200).json({
            success: true,
            message: 'Pickup verified successfully. Order is now out for delivery.',
            deliveryOtp,
            order
        });

    } catch (error) {
        console.error('Error verifying pickup:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.initiateDeliveryCompletion = async (req, res) => {
    try {
        const { orderId, driverId } = req.body;

        if (!orderId || !driverId) {
            return res.status(400).json({
                success: false,
                message: 'orderId and driverId are required'
            });
        }

        const Order = require('../Order/model');
        const ChatOrder = require('../ChatOrdrer/model');

        // Try to find the order in both collections
        let order = await Order.findOne({ orderId: orderId, driverId: driverId });
        let isChatOrder = false;

        if (!order) {
            order = await ChatOrder.findOne({ orderId: orderId, driverId: driverId });
            if (order) isChatOrder = true;
        }

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found or driver not matched'
            });
        }

        // OTP is already generated during pickup verification
        console.log(`\n************************************`);
        console.log(`[DELIVERY INITIATED] Order: ${orderId}`);
        console.log(`[DELIVERY INITIATED] Driver ${driverId} swiped to deliver.`);
        console.log(`************************************\n`);

        res.status(200).json({
            success: true,
            message: 'Delivery process initiated.'
        });

    } catch (error) {
        console.error('Error initiating delivery completion:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.completeDelivery = async (req, res) => {
    try {
        const { orderId, driverId, deliveryOtp } = req.body;

        if (!orderId || !driverId || !deliveryOtp) {
            return res.status(400).json({
                success: false,
                message: 'orderId, driverId and deliveryOtp are required'
            });
        }

        // Find the order
        const Order = require('../Order/model');
        const ChatOrder = require('../ChatOrdrer/model');
        let order = await Order.findOne({ orderId: orderId });
        let isChatOrder = false;

        if (!order) {
            order = await ChatOrder.findOne({ orderId: orderId });
            if (order) isChatOrder = true;
        }

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify driver is assigned to this order
        if (order.driverId.toString() !== driverId) {
            return res.status(403).json({
                success: false,
                message: 'You are not assigned to this order'
            });
        }

        // Verify Delivery OTP
        if (Number(deliveryOtp) !== order.deliveryOtp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid delivery OTP'
            });
        }

        // Get delivery fee from the calculated fee stored in the order
        const deliveryFee = order.driverDeliveryFee?.totalFee || 0;

        // Update order status to 'Delivered' and calculate deliveredInMin
        const currentTime = new Date();
        const createdAt = order.createdAt;
        const deliveredInMin = Math.floor((currentTime - createdAt) / 60000);

        if (isChatOrder) {
            order.orderStatus = 'Delivered';
            order.deliveredInMin = deliveredInMin;
        } else {
            order.vendors.forEach(vendor => {
                vendor.orderStatus = 'Delivered';
                vendor.deliveredInMin = deliveredInMin;
            });
        }

        // Set deliveredAt timestamp for 12-hour payment deadline tracking
        order.deliveredAt = currentTime;

        await order.save();

        // Send push notification to customer
        const customerDetails = await Customer.findById(order.customer);
        if (customerDetails && customerDetails.fcmDeviceToken) {
            const title = 'Order Delivered';
            const body = `Your order ${orderId} has been delivered successfully. Thank you for shopping with us!`;
            try {
                await sendPushNotification(customerDetails.fcmDeviceToken, title, body);
            } catch (err) {
                console.error('Error sending delivery notification:', err);
            }
        }

        // Update driver: clear currentOrderId and add to wallet
        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        driver.currentOrderId = null;
        driver.walletBalance = (driver.walletBalance || 0) + deliveryFee;

        // ===== Update Floating Cash for COD Orders =====
        if (order.paymentStatus !== 'Paid') {
            // Calculate total order amount
            let calculatedTotal = 0;

            if (isChatOrder) {
                // For chat orders, sum up all products
                order.products.forEach(item => {
                    calculatedTotal += item.totalAmount || (item.price * item.quantity);
                });
                calculatedTotal += (order.deliveryCharge || 0);
            } else {
                // For regular orders, sum up all vendor products
                order.vendors.forEach(vendor => {
                    vendor.products.forEach(product => {
                        calculatedTotal += product.totalAmount || (product.price * product.quantity);
                    });
                    calculatedTotal += (vendor.deliveryCharge || 0);
                });
                calculatedTotal += (order.shippingFee || 0);
            }

            // Add to driver's floating cash
            driver.floatingCash = (driver.floatingCash || 0) + calculatedTotal;

            // Update order tracking
            order.floatingCashAmount = calculatedTotal;
            order.floatingCashStatus = 'Pending';
            await order.save();

            console.log(`Updated Driver ${driverId} floating cash: +₹${calculatedTotal}`);
        }
        // ===== END: Floating Cash Update =====

        await driver.save();

        console.log(`Order ${orderId} delivered by driver ${driverId}. Earned: ₹${deliveryFee}`);

        res.status(200).json({
            success: true,
            message: 'Delivery completed successfully!',
            walletBalance: driver.walletBalance,
            earned: deliveryFee
        });

    } catch (error) {
        console.error('Error completing delivery:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.getWalletBalance = async (req, res) => {
    try {
        const { driverId } = req.params;

        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        // ===== 12:00 AM IST Deadline Logic =====
        const Order = require('../Order/model');
        const ChatOrder = require('../ChatOrdrer/model');

        // Calculate Start of Today in IST (India Standard Time: UTC+5:30)
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 mins in ms
        const istNow = new Date(now.getTime() + istOffset);
        const startOfTodayIST = new Date(istNow);
        startOfTodayIST.setUTCHours(0, 0, 0, 0); // Midnight in IST

        // Convert IST Midnight back to UTC for DB comparison
        const deadlineUTC = new Date(startOfTodayIST.getTime() - istOffset);

        // Find any order from previous days that is still 'Pending'
        const overdueRegular = await Order.find({
            driverId: driverId,
            floatingCashStatus: 'Pending',
            deliveredAt: { $ne: null, $lt: deadlineUTC }
        });
        const overdueChat = await ChatOrder.find({
            driverId: driverId,
            floatingCashStatus: 'Pending',
            deliveredAt: { $ne: null, $lt: deadlineUTC }
        });
        const overdueOrdersCount = overdueRegular.length + overdueChat.length;

        // Calculate real-time Floating Cash sum (Only for Delivered orders)
        const pendingCashRegular = await Order.find({
            driverId: driverId,
            floatingCashStatus: 'Pending',
            deliveredAt: { $ne: null }
        });
        const pendingCashChat = await ChatOrder.find({
            driverId: driverId,
            floatingCashStatus: 'Pending',
            deliveredAt: { $ne: null }
        });

        const calcFloatingCash = (orders, isChat) => orders.reduce((sum, order) => {
            if (order.floatingCashAmount !== null && order.floatingCashAmount !== undefined && order.floatingCashAmount !== 0) {
                return sum + order.floatingCashAmount;
            }

            // Fallback: Recalculate same as in completeDelivery
            let orderTotal = 0;
            if (isChat) {
                const products = order.products || [];
                products.forEach(item => {
                    orderTotal += item.totalAmount || (item.price * item.quantity);
                });
                orderTotal += (order.deliveryCharge || 0);
            } else {
                const vendors = order.vendors || [];
                vendors.forEach(vendor => {
                    const products = vendor.products || [];
                    products.forEach(product => {
                        orderTotal += product.totalAmount || (product.price * product.quantity);
                    });
                    orderTotal += (vendor.deliveryCharge || 0);
                });
                orderTotal += (order.shippingFee || 0);
            }
            return sum + orderTotal;
        }, 0);

        const totalFloatingCash = calcFloatingCash(pendingCashRegular, false) + calcFloatingCash(pendingCashChat, true);
        const totalOverdueAmount = calcFloatingCash(overdueRegular, false) + calcFloatingCash(overdueChat, true);

        // Calculate real-time Paid Earnings (Available Balance - Only for Delivered orders)
        const paidEarningsRegular = await Order.find({
            driverId: driverId,
            driverEarningStatus: 'Paid',
            deliveredAt: { $ne: null }
        });
        const paidEarningsChat = await ChatOrder.find({
            driverId: driverId,
            driverEarningStatus: 'Paid',
            deliveredAt: { $ne: null }
        });

        // Use settings for fallback if needed
        const Settings = require('../Settings/model');
        let settings = await Settings.findOne();
        if (!settings) settings = { driverDeliveryFee: { basePay: 30, baseDistance: 5, perKmRate: 10 } };
        const { calculateDeliveryFee } = require('./pricingUtil');

        const calcEarnings = (orders) => orders.reduce((sum, order) => {
            let earning = order.driverDeliveryFee?.totalFee;
            if (earning === undefined || earning === null || earning === 0) {
                const feeInfo = calculateDeliveryFee(order.distance || 0, settings);
                earning = feeInfo.amount || 0;
            }
            return sum + earning;
        }, 0);

        const totalPaidEarnings = calcEarnings(paidEarningsRegular) + calcEarnings(paidEarningsChat);

        res.status(200).json({
            success: true,
            balance: totalPaidEarnings, // Show only cleared (Paid) earnings
            floatingCash: totalFloatingCash, // Use calculated sum instead of static field
            floatingCashLimit: driver.floatingCashLimit || 2000,
            isOnline: driver.isOnline || false,
            isPaymentOverdue: overdueOrdersCount > 0,
            overdueCount: overdueOrdersCount,
            overdueAmount: totalOverdueAmount
        });

    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};
exports.getActiveOrder = async (req, res) => {
    try {
        const { driverId } = req.params;
        const Order = require('../Order/model');
        const ChatOrder = require('../ChatOrdrer/model');
        const Vendor = require('../Vendor/model');

        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }

        if (!driver.currentOrderId) {
            return res.status(200).json({ success: true, hasActiveOrder: false });
        }

        // Try to find the order in both collections
        let order = await Order.findById(driver.currentOrderId).populate('customer');
        let isChatOrder = false;

        if (!order) {
            order = await ChatOrder.findById(driver.currentOrderId).populate('customer');
            if (order) isChatOrder = true;
        }

        if (!order) {
            return res.status(200).json({ success: true, hasActiveOrder: false });
        }

        let reconstructedOrder = {};
        if (isChatOrder) {
            const vendor = await Vendor.findById(order.vendor);
            const Settings = require('../Settings/model');
            let settings = await Settings.findOne();
            if (!settings) settings = { driverDeliveryFee: { basePay: 30, baseDistance: 5, perKmRate: 10 } };

            const { calculateDeliveryFee } = require('./pricingUtil');

            // Fallbacks for missing driverDeliveryFee
            let totalDistance = order.driverDeliveryFee?.totalDistance;
            let earning = order.driverDeliveryFee?.totalFee;

            if (totalDistance === undefined || totalDistance === null || totalDistance === 0) {
                totalDistance = order.distance || 0;
            }

            if (earning === undefined || earning === null || earning === 0) {
                const feeInfo = calculateDeliveryFee(order.distance || 0, settings);
                earning = feeInfo.amount || 0;
            }

            reconstructedOrder = {
                orderId: order.orderId,
                totalDistance: totalDistance,
                earning: earning,
                status: order.orderStatus,
                isChatOrder: true,
                createdAt: order.createdAt,
                rawOfferData: {
                    orderId: order.orderId,
                    pickupLocation: vendor?.location?.coordinates ? {
                        latitude: vendor.location.coordinates[1],
                        longitude: vendor.location.coordinates[0]
                    } : null,
                    vendorName: vendor?.name || 'Vendor',
                    vendorAddress: vendor?.location?.address ?
                        (typeof vendor.location.address === 'string' ? vendor.location.address : `${vendor.location.address.addressLine1 || ''}, ${vendor.location.address.city || ''}`) :
                        'Vendor Address',
                    vendorPhone: vendor?.vendorInfo?.contactNumber || 'N/A',
                    dropLocation: {
                        latitude: order.shippingAddress.latitude,
                        longitude: order.shippingAddress.longitude
                    },
                    shippingAddress: order.shippingAddress,
                    customerName: order.customer?.name || order.shippingAddress?.name || order.name || 'Customer',
                    customerPhone: order.shippingAddress?.phone || order.customer?.contactNumber || 'N/A',
                    ...enrichItemsAndTotal(order, true)
                }
            };
        } else {
            const status = order.vendors[0]?.orderStatus;
            const vendor = await Vendor.findById(order.vendors[0].vendor);
            const Settings = require('../Settings/model');
            let settings = await Settings.findOne();
            if (!settings) settings = { driverDeliveryFee: { basePay: 30, baseDistance: 5, perKmRate: 10 } };

            const { calculateDeliveryFee } = require('./pricingUtil');

            // Fallbacks for missing driverDeliveryFee
            let totalDistance = order.driverDeliveryFee?.totalDistance;
            let earning = order.driverDeliveryFee?.totalFee;

            if (totalDistance === undefined || totalDistance === null || totalDistance === 0) {
                totalDistance = order.distance || 0;
            }

            if (earning === undefined || earning === null || earning === 0) {
                const feeInfo = calculateDeliveryFee(order.distance || 0, settings);
                earning = feeInfo.amount || 0;
            }

            reconstructedOrder = {
                orderId: order.orderId,
                totalDistance: totalDistance,
                earning: earning,
                status: status,
                isChatOrder: false,
                createdAt: order.createdAt,
                rawOfferData: {
                    orderId: order.orderId,
                    pickupLocation: vendor ? {
                        latitude: vendor.location.coordinates[1],
                        longitude: vendor.location.coordinates[0]
                    } : null,
                    vendorName: vendor?.name || 'Vendor',
                    vendorAddress: vendor?.location?.address ?
                        (typeof vendor.location.address === 'string' ? vendor.location.address : `${vendor.location.address.addressLine1 || ''}, ${vendor.location.address.city || ''}`) :
                        'Vendor Address',
                    vendorPhone: vendor?.vendorInfo?.contactNumber || 'N/A',
                    dropLocation: {
                        latitude: order.shippingAddress.latitude,
                        longitude: order.shippingAddress.longitude
                    },
                    shippingAddress: order.shippingAddress,
                    customerName: order.customer?.name || order.shippingAddress?.name || order.name || 'Customer',
                    customerPhone: order.shippingAddress?.phone || order.customer?.contactNumber || 'N/A',
                    ...enrichItemsAndTotal(order, false)
                }
            };
        }

        res.status(200).json({
            success: true,
            hasActiveOrder: true,
            order: reconstructedOrder
        });

    } catch (error) {
        console.error('Error fetching active order:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.getDriverOrders = async (req, res) => {
    try {
        const { driverId } = req.params;
        const Order = require('../Order/model');
        const ChatOrder = require('../ChatOrdrer/model');
        const Vendor = require('../Vendor/model');
        const OrderAssignment = require('./orderAssignment.model');

        // 1. Fetch currently active regular orders assigned to driver
        const activeOrders = await Order.find({
            driverId: driverId,
            'vendors.orderStatus': { $in: ['Processing', 'Shipped'] }
        }).populate('customer').sort({ createdAt: -1 }).lean();

        const mappedActive = await Promise.all(activeOrders.map(async (order) => {
            const status = order.vendors[0]?.orderStatus;
            const vendorId = order.vendors[0]?.vendor;
            const vendor = await Vendor.findById(vendorId);

            const Settings = require('../Settings/model');
            let settings = await Settings.findOne();
            if (!settings) settings = { driverDeliveryFee: { basePay: 30, baseDistance: 5, perKmRate: 10 } };

            const { calculateDeliveryFee } = require('./pricingUtil');

            // Fallbacks for missing driverDeliveryFee
            let totalDistance = order.driverDeliveryFee?.totalDistance;
            let earning = order.driverDeliveryFee?.totalFee;

            if (totalDistance === undefined || totalDistance === null || totalDistance === 0) {
                // For regular orders, distance is typically vendor to customer
                // Total distance would ideally be driver -> vendor -> customer, but here we fallback to vendor -> customer
                const shippingDist = order.vendors?.[0]?.deliveryCharge === 0 ? 0 : (order.shippingFee > 0 ? 5 : 0); // rough estimate if missing
                totalDistance = order.distance || 0;
            }

            if (earning === undefined || earning === null || earning === 0) {
                const feeInfo = calculateDeliveryFee(order.distance || 0, settings);
                earning = feeInfo.amount || 0;
            }

            return {
                orderId: order.orderId,
                totalDistance: totalDistance,
                earning: earning,
                status: status,
                isOffer: false,
                isChatOrder: false,
                createdAt: order.createdAt,
                _debug: console.log(`[DEBUG] Order ${order.orderId} - Shipping: ${order.shippingFee}, Delivery: ${order.vendors?.[0]?.deliveryCharge}`),
                rawOfferData: {
                    orderId: order.orderId,
                    pickupLocation: vendor ? {
                        latitude: vendor.location.coordinates[1],
                        longitude: vendor.location.coordinates[0]
                    } : null,
                    vendorName: vendor?.name || 'Vendor',
                    vendorPhone: vendor?.phone || 'N/A',
                    vendorAddress: vendor?.location?.address ?
                        (typeof vendor.location.address === 'string' ? vendor.location.address : `${vendor.location.address.addressLine1 || ''}, ${vendor.location.address.city || ''}`) :
                        'Vendor Address',
                    dropLocation: {
                        latitude: order.shippingAddress.latitude,
                        longitude: order.shippingAddress.longitude
                    },
                    shippingAddress: order.shippingAddress,
                    customerName: order.customer?.name || order.shippingAddress?.name || order.name || 'Customer',
                    customerPhone: order.shippingAddress?.phone || order.customer?.contactNumber || 'N/A',
                    shippingFee: order.shippingFee || 0,
                    deliveryCharge: order.vendors?.[0]?.deliveryCharge || 0,
                    ...enrichItemsAndTotal(order, false)
                }
            };
        }));

        // 1b. Fetch currently active chat orders assigned to driver
        const activeChatOrders = await ChatOrder.find({
            driverId: driverId,
            orderStatus: { $in: ['Processing', 'Shipped'] }
        }).populate('customer').sort({ createdAt: -1 }).lean();

        const mappedActiveChat = await Promise.all(activeChatOrders.map(async (order) => {
            const vendor = await Vendor.findById(order.vendor);
            const Settings = require('../Settings/model');
            let settings = await Settings.findOne();
            if (!settings) settings = { driverDeliveryFee: { basePay: 30, baseDistance: 5, perKmRate: 10 } };

            const { calculateDeliveryFee } = require('./pricingUtil');

            // Fallbacks for missing driverDeliveryFee (common for older chat orders)
            let totalDistance = order.driverDeliveryFee?.totalDistance;
            let earning = order.driverDeliveryFee?.totalFee;

            if (totalDistance === undefined || totalDistance === null || totalDistance === 0) {
                totalDistance = order.distance || 0;
            }

            if (earning === undefined || earning === null || earning === 0) {
                // If fee is missing, calculate a proxy based on pickup-to-drop distance
                const feeInfo = calculateDeliveryFee(order.distance || 0, settings);
                earning = feeInfo.amount || 0;
            }

            return {
                orderId: order.orderId,
                totalDistance: totalDistance,
                earning: earning,
                status: order.orderStatus,
                isOffer: false,
                isChatOrder: true,
                createdAt: order.createdAt,
                rawOfferData: {
                    orderId: order.orderId,
                    pickupLocation: vendor ? {
                        latitude: vendor.location.coordinates[1],
                        longitude: vendor.location.coordinates[0]
                    } : null,
                    vendorName: vendor?.name || 'Vendor',
                    vendorPhone: vendor?.phone || 'N/A',
                    vendorAddress: vendor?.location?.address ?
                        (typeof vendor.location.address === 'string' ? vendor.location.address : `${vendor.location.address.addressLine1 || ''}, ${vendor.location.address.city || ''}`) :
                        'Vendor Address',
                    dropLocation: {
                        latitude: order.shippingAddress.latitude,
                        longitude: order.shippingAddress.longitude
                    },
                    shippingAddress: order.shippingAddress,
                    customerName: order.customer?.name || order.shippingAddress?.name || order.name || 'Customer',
                    customerPhone: order.shippingAddress?.phone || order.customer?.contactNumber || 'N/A',
                    shippingFee: order.shippingFee || 0,
                    deliveryCharge: order.deliveryCharge || 0,
                    ...enrichItemsAndTotal(order, true)
                }
            };
        }));

        // 2. Fetch pending offers from OrderAssignment
        const pendingOffers = await OrderAssignment.find({
            driverId: driverId,
            status: 'pending'
        }).sort({ createdAt: -1 });

        const mappedOffers = await Promise.all(pendingOffers.map(async (offer) => {
            // Try regular Order
            let order = await Order.findById(offer.orderId).lean();
            let isChat = false;

            if (!order) {
                // Try ChatOrder
                order = await ChatOrder.findById(offer.orderId).lean();
                if (order) isChat = true;
            }

            // If order doesn't exist or already has a driver, it's no longer a valid offer
            if (!order || order.driverId) {
                // Background cleanup: mark as expired so it doesn't show up next time
                if (offer.status === 'pending') {
                    await OrderAssignment.findByIdAndUpdate(offer._id, { status: 'expired' });
                }
                return null;
            }

            const vendorId = isChat ? order.vendor : order.vendors[0].vendor;
            const vendor = await Vendor.findById(vendorId);

            return {
                orderId: order.orderId,
                totalDistance: offer.totalDistance || offer.distance || 0,
                earning: offer.earning || 0,
                status: 'Offer',
                isOffer: true,
                isChatOrder: isChat,
                createdAt: order.createdAt,
                rawOfferData: {
                    orderId: order.orderId,
                    pickupLocation: vendor ? {
                        latitude: vendor.location.coordinates[1],
                        longitude: vendor.location.coordinates[0]
                    } : null,
                    vendorName: vendor?.name || 'Vendor',
                    vendorAddress: vendor?.location?.address ?
                        (typeof vendor.location.address === 'string' ? vendor.location.address : `${vendor.location.address.addressLine1 || ''}, ${vendor.location.address.city || ''}`) :
                        'Vendor Address',
                    dropLocation: {
                        latitude: order.shippingAddress.latitude,
                        longitude: order.shippingAddress.longitude
                    },
                    shippingAddress: order.shippingAddress,
                    customerName: order.shippingAddress?.name || order.customer?.name || order.name,
                    customerPhone: order.shippingAddress?.phone || order.customer?.contactNumber,
                    shippingFee: order.shippingFee || 0,
                    deliveryCharge: isChat ? (order.deliveryCharge || 0) : (order.vendors?.[0]?.deliveryCharge || 0),
                    ...enrichItemsAndTotal(order, isChat)
                }
            };
        }));

        // Filter out any nulls and merge
        const finalOrders = [
            ...mappedOffers.filter(o => o !== null),
            ...mappedActive,
            ...mappedActiveChat
        ];

        res.status(200).json({
            success: true,
            orders: finalOrders
        });

    } catch (error) {
        console.error('Error fetching driver orders:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.getCompletedOrders = async (req, res) => {
    try {
        const { driverId } = req.params;
        const { startDate, endDate } = req.query; // Extract date filters
        const Order = require('../Order/model');
        const ChatOrder = require('../ChatOrdrer/model');

        // Build date filter query if dates are provided
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                deliveredAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        // Fetch regular completed orders with date filter
        const completedOrders = await Order.find({
            driverId: driverId,
            'vendors.orderStatus': 'Delivered',
            ...dateFilter
        }).sort({ deliveredAt: -1 });

        console.log(`[DEBUG] Found ${completedOrders.length} regular completed orders`);

        const Settings = require('../Settings/model');
        let settings = await Settings.findOne();
        if (!settings) settings = { driverDeliveryFee: { basePay: 30, baseDistance: 5, perKmRate: 10 } };
        const { calculateDeliveryFee } = require('./pricingUtil');

        const mappedHistory = completedOrders.map(order => {
            let earning = order.driverDeliveryFee?.totalFee;
            if (earning === undefined || earning === null || earning === 0) {
                const feeInfo = calculateDeliveryFee(order.distance || 0, settings);
                earning = feeInfo.amount || 0;
            }

            return {
                orderId: order.orderId,
                earning: earning,
                earningStatus: order.driverEarningStatus || 'Pending',
                floatingCashAmount: order.floatingCashAmount || 0,
                floatingCashStatus: order.floatingCashStatus || 'Pending',
                date: order.deliveredAt || order.updatedAt, // Fallback to updatedAt if deliveredAt is missing
                customerName: order.shippingAddress?.name || order.name,
                address: order.shippingAddress?.address || 'N/A',
                isChatOrder: false
            };
        });

        // Fetch completed chat orders with date filter
        const completedChatOrders = await ChatOrder.find({
            driverId: driverId,
            orderStatus: 'Delivered',
            ...dateFilter
        }).sort({ deliveredAt: -1 });

        console.log(`[DEBUG] Found ${completedChatOrders.length} chat completed orders`);

        const mappedChatHistory = completedChatOrders.map(order => {
            let earning = order.driverDeliveryFee?.totalFee;
            if (earning === undefined || earning === null || earning === 0) {
                const feeInfo = calculateDeliveryFee(order.distance || 0, settings);
                earning = feeInfo.amount || 0;
            }

            return {
                orderId: order.orderId,
                earning: earning,
                earningStatus: order.driverEarningStatus || 'Pending',
                floatingCashAmount: order.floatingCashAmount || 0,
                floatingCashStatus: order.floatingCashStatus || 'Pending',
                date: order.deliveredAt || order.updatedAt, // Fallback to updatedAt
                customerName: order.shippingAddress?.name || order.name,
                address: order.shippingAddress?.address || 'N/A',
                isChatOrder: true
            };
        });

        // Combine and sort
        const finalHistory = [...mappedHistory, ...mappedChatHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json({
            success: true,
            orders: finalHistory
        });
    } catch (error) {
        console.error('Error fetching completed orders:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};

module.exports = exports;
