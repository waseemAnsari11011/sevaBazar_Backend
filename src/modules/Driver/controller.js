const Driver = require("./model");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const Settings = require("../Settings/model");
const Customer = require('../Customer/model');
const { sendPushNotification } = require('../utils/pushNotificationUtil');
const { calculateDistance, calculateDeliveryFee } = require('../Driver/pricingUtil');

// Helper to get Midnight IST in UTC
const getISTMidnight = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const startOfTodayIST = new Date(istNow);
    startOfTodayIST.setUTCHours(0, 0, 0, 0);
    const deadlineUTC = new Date(startOfTodayIST.getTime() - istOffset);
    return { deadlineUTC, startOfTodayIST, now };
};

// Generic isSameDay check for IST reset consistency
const isSameDayIST = (d1, d2) => {
    if (!d1 || !d2) return false;
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return date1.getUTCDate() === date2.getUTCDate() &&
        date1.getUTCMonth() === date2.getUTCMonth() &&
        date1.getUTCFullYear() === date2.getUTCFullYear();
};

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
    console.log("Driver login request:");
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

        if (driver.isBlocked) {
            return res.status(403).json({ message: "Your account is blocked due to multiple rejections. Please contact support." });
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
                currentLocation: driver.currentLocation,
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

// Admin: manually unblock a driver blocked due to rejections
exports.unblockDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const driver = await Driver.findByIdAndUpdate(
            id,
            {
                isBlocked: false,
                blockedAt: null,
                rejectionCount: 0,
                lastRejectionResetAt: new Date(),
            },
            { new: true }
        );
        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        // Clear all rejected assignments so "Rejected" tab appears empty
        const OrderAssignment = require('./orderAssignment.model');
        await OrderAssignment.deleteMany({ driverId: id, status: 'rejected' });

        console.log(`[UNBLOCK] Driver ${id} manually unblocked by admin. Rejected assignments cleared.`);
        res.status(200).json({ success: true, message: "Driver unblocked successfully", driver });
    } catch (error) {
        console.error("Error unblocking driver:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

exports.updateOnlineStatus = async (req, res) => {
    try {
        const { isOnline } = req.body;
        const driverId = req.user.id;

        const updateData = { isOnline };
        const Order = require('../Order/model');
        const ChatOrder = require('../ChatOrdrer/model');
        const { deadlineUTC, startOfTodayIST, now } = getISTMidnight();

        if (isOnline) {
            // Only update lastOnlineAt if they were previously offline,
            // to avoid resetting the "live" ticker on every foreground/refresh.
            const driver = await Driver.findById(driverId);
            if (driver && !driver.isOnline) {
                console.log(`[ONLINE_TIME] Driver ${driverId} going online at ${now.toISOString()}`);
                updateData.lastOnlineAt = now;
            } else if (driver && !driver.lastOnlineAt) {
                // Sanity: if online but missing timestamp, set it
                updateData.lastOnlineAt = now;
            }
        } else {
            const driver = await Driver.findById(driverId);
            if (driver && driver.lastOnlineAt) {
                const lastOnlineAt = new Date(driver.lastOnlineAt);

                // If session started before midnight IST, only count from midnight IST
                const effectiveStart = lastOnlineAt < deadlineUTC ? deadlineUTC : lastOnlineAt;
                const duration = now.getTime() - effectiveStart.getTime();

                // If it's a new day since last tracking OR if data is corrupted (>24h), reset bucket
                const lastReset = driver.lastOnlineResetAt ? new Date(driver.lastOnlineResetAt) : null;
                const isNewDay = !isSameDayIST(lastReset, startOfTodayIST);
                const isInvalidTotal = (driver.totalOnlineTimeToday || 0) > 24 * 60 * 60 * 1000;

                const currentTotal = (isNewDay || isInvalidTotal) ? 0 : (driver.totalOnlineTimeToday || 0);

                updateData.totalOnlineTimeToday = currentTotal + (duration > 0 ? duration : 0);
                updateData.lastOnlineAt = null;
                updateData.lastOnlineResetAt = startOfTodayIST;

                console.log(`[ONLINE_TIME] Driver ${driverId} going offline. Session: ${duration}ms, New Total: ${updateData.totalOnlineTimeToday}ms`);
            }
        }

        const driver = await Driver.findByIdAndUpdate(
            driverId,
            updateData,
            { new: true }
        );

        if (!driver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        // Trigger Auto-Allocation for the newly online driver
        if (isOnline && driver.currentLocation?.coordinates?.length === 2 && !driver.currentOrderId) {
            const driverLoc = {
                latitude: driver.currentLocation.coordinates[1],
                longitude: driver.currentLocation.coordinates[0]
            };
            autoAllocateNearestOrder(driverId, driverLoc, req.app);
        }

        res.status(200).json({
            message: `Driver is now ${isOnline ? "online" : "offline"}`,
            isOnline: driver.isOnline,
            lastOnlineAt: driver.lastOnlineAt,
            totalOnlineTimeToday: driver.totalOnlineTimeToday
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
                searchRadius = req.radius; // Allow internal calls to specify radius
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


        const finalRadius = searchRadius || 50;
        const radiusInMeters = finalRadius * 1000;

        console.log(`[findNearestDrivers] Initiating search for Order: ${orderId} | Radius: ${finalRadius}km (${radiusInMeters}m) | Center: [${searchLon}, ${searchLat}]`);

        const geoQuery = {
            approvalStatus: "approved",
            isOnline: true,
            isBlocked: false,
            currentOrderId: null,
        };
        console.log(`[findNearestDrivers] $geoNear Query: ${JSON.stringify(geoQuery)}`);

        const drivers = await Driver.aggregate([
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [parseFloat(searchLon), parseFloat(searchLat)],
                    },
                    distanceField: "distanceFromVendor",
                    maxDistance: radiusInMeters,
                    query: geoQuery,
                    spherical: true,
                },
            }
        ]);

        console.log(`[findNearestDrivers] $geoNear found ${drivers.length} drivers for Order: ${orderId}`);
        if (drivers.length === 0) {
            // Check if there are ANY online drivers regardless of distance
            const onlineCount = await Driver.countDocuments({ isOnline: true, isBlocked: false, approvalStatus: "approved", currentOrderId: null });
            console.log(`[findNearestDrivers] DEBUG: No drivers in radius. Total free/online drivers in DB: ${onlineCount}`);
        }

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
                const mongoose = require('mongoose'); // Ensure mongoose is available for ObjectId.isValid
                console.log(`[findNearestDrivers] Looking up Order: ${orderId}`);

                // More robust OR query for orderId or _id
                const query = {
                    $or: [
                        { orderId: orderId },
                        ...(mongoose.Types.ObjectId.isValid(orderId) ? [{ _id: orderId }] : [])
                    ]
                };

                orderData = await Order.findOne(query)
                    .populate('vendors.vendor')
                    .populate('customer', 'name contactNumber');

                if (orderData) {
                    console.log(`[findNearestDrivers] Found Regular Order: ${orderData.orderId} (_id: ${orderData._id})`);
                    dbOrderId = orderData._id;
                    // Set isDriverRequested to true ONLY when explicitly requested via API (not internal triggers)
                    if (!isInternal && !orderData.isDriverRequested) {
                        orderData.isDriverRequested = true;
                        await orderData.save();
                    }
                } else {
                    // Try ChatOrder
                    console.log(`[findNearestDrivers] Regular Order not found, trying ChatOrder: ${orderId}`);
                    const ChatOrder = require('../ChatOrdrer/model');
                    orderData = await ChatOrder.findOne(query)
                        .populate('vendor')
                        .populate('customer', 'name contactNumber');
                    if (orderData) {
                        console.log(`[findNearestDrivers] Found Chat Order: ${orderData.orderId} (_id: ${orderData._id})`);
                        dbOrderId = orderData._id;
                        isChatOrder = true;
                        // Set isDriverRequested to true ONLY when explicitly requested via API (not internal triggers)
                        if (!isInternal && !orderData.isDriverRequested) {
                            orderData.isDriverRequested = true;
                            await orderData.save();
                        }
                    } else {
                        console.log(`[findNearestDrivers] ERROR: Order ${orderId} NOT FOUND in either model!`);
                    }
                }
            } catch (err) {
                console.error("[findNearestDrivers] Order lookup error:", err.message);
            }
        }

        // Trigger Socket Event to found drivers
        if (results.length > 0) {
            console.log(`[SOCKET] Found ${results.length} drivers: ${results.map(d => d.name).join(', ')}`);
            const io = (req && req.app) ? req.app.get("io") : (req && req.io ? req.io : null);
            console.log(`[SOCKET] io instance found: ${!!io}`);
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
                    businessName: firstVendor?.vendorInfo?.businessName || firstVendor?.name || 'Vendor',
                    vendorShopPhoto: (firstVendor?.documents?.shopPhoto && firstVendor.documents.shopPhoto.length > 0) ? firstVendor.documents.shopPhoto[0] : null,
                    vendorPhone: firstVendor?.vendorInfo?.contactNumber || 'N/A',
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
                            businessName: fullOfferData.businessName || fullOfferData.vendorName || 'Vendor',
                            vendorShopPhoto: fullOfferData.vendorShopPhoto || '',
                            vendorPhone: fullOfferData.vendorPhone || 'N/A',
                            pickupLocation: JSON.stringify(fullOfferData.pickupLocation),
                            dropLocation: JSON.stringify(fullOfferData.dropLocation),
                            totalAmount: fullOfferData.totalAmount?.toString() || '0'
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

        // Emit socket event to vendor room for real-time refresh
        const io = req.app.get('io');
        if (io) {
            if (isChatOrder) {
                if (order.vendor) {
                    console.log(`[SOCKET] Emitting order_status_update (Shipped) to vendor: ${order.vendor}`);
                    io.to(order.vendor.toString()).emit('order_status_update', {
                        orderId: order._id.toString(),
                        status: 'Shipped'
                    });
                }
            } else {
                order.vendors.forEach(v => {
                    const vId = v.vendor._id || v.vendor;
                    if (vId) {
                        console.log(`[SOCKET] Emitting order_status_update (Shipped) to vendor: ${vId}`);
                        io.to(vId.toString()).emit('order_status_update', {
                            orderId: order._id.toString(),
                            status: 'Shipped'
                        });
                    }
                });
            }
        }

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

/**
 * Auto-allocation logic: Finds the nearest unassigned "Processing" order
 * and triggers findNearestDrivers for it.
 */
const autoAllocateNearestOrder = async (driverId, driverLocation, app) => {
    try {
        if (!driverId || !driverLocation) return;

        const Order = require('../Order/model');
        const ChatOrder = require('../ChatOrdrer/model');
        const Vendor = require('../Vendor/model');
        const { calculateDistance } = require("./pricingUtil");
        const OrderAssignment = require('./orderAssignment.model');

        // 1. Find all Processing orders without a driver
        // Regular Orders: any vendor in processing status that doesn't have a global driver assigned
        const pendingRegular = await Order.find({
            driverId: null,
            isDriverRequested: true,
            'vendors.orderStatus': 'Processing'
        });

        const pendingChat = await ChatOrder.find({
            driverId: null,
            isDriverRequested: true,
            orderStatus: 'Processing'
        });

        console.log(`[AUTO-ALLOCATE] Checking for freed driver ${driverId} | Pending Regular: ${pendingRegular.length} | Pending Chat: ${pendingChat.length}`);

        // 2. Combine and find the nearest one
        let nearestOrder = null;
        let minDistance = Infinity;

        // Handle Regular Orders
        for (const order of pendingRegular) {
            // Check if this specific driver already rejected this order
            const rejected = await OrderAssignment.findOne({ orderId: order._id, driverId, status: 'rejected' });
            if (rejected) {
                console.log(`[AUTO-ALLOCATE] Skipping already rejected Regular order ${order.orderId} for driver ${driverId}`);
                continue;
            }

            const rawVendor = order.vendors[0]?.vendor;
            const firstVendorId = (rawVendor && typeof rawVendor === 'object') ? (rawVendor._id || rawVendor) : rawVendor;

            if (!firstVendorId) continue;
            const vendor = await Vendor.findById(firstVendorId);
            if (vendor && vendor.location?.coordinates) {
                const dist = calculateDistance(
                    driverLocation.latitude,
                    driverLocation.longitude,
                    vendor.location.coordinates[1],
                    vendor.location.coordinates[0]
                );
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestOrder = { orderId: order.orderId, vendorId: firstVendorId };
                }
            }
        }

        // Handle Chat Orders
        for (const order of pendingChat) {
            // Check if this specific driver already rejected this order
            const rejected = await OrderAssignment.findOne({ orderId: order._id, driverId, status: 'rejected' });
            if (rejected) {
                console.log(`[AUTO-ALLOCATE] Skipping already rejected Chat order ${order.orderId} for driver ${driverId}`);
                continue;
            }

            const vendorId = order.vendor;
            const vendor = await Vendor.findById(vendorId);
            if (vendor && vendor.location?.coordinates) {
                const dist = calculateDistance(
                    driverLocation.latitude,
                    driverLocation.longitude,
                    vendor.location.coordinates[1],
                    vendor.location.coordinates[0]
                );
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestOrder = { orderId: order.orderId, vendorId: vendorId };
                }
            }
        }

        // 3. Trigger search if a nearby order is found (within 50km)
        if (nearestOrder && minDistance <= 50) { // Increased to 50km for testing
            console.log(`[AUTO-ALLOCATE] Found nearest pending order ${nearestOrder.orderId} for freed driver ${driverId}. Distance: ${minDistance.toFixed(2)}km. Radius: 50km.`);
            const { findNearestDrivers } = require('./controller');

            // Trigger the search internally
            const results = await findNearestDrivers({
                vendorId: nearestOrder.vendorId,
                orderId: nearestOrder.orderId,
                app: app,
                radius: 50 // Explicitly pass a larger radius
            });
            console.log(`[AUTO-ALLOCATE] Internal findNearestDrivers for ${nearestOrder.orderId} found ${results?.length || 0} drivers.`);
        } else {
            console.log(`[AUTO-ALLOCATE] No pending order found within 50km for driver ${driverId}. Best was: ${nearestOrder?.orderId || 'None'} at ${minDistance.toFixed(2)}km`);
        }
    } catch (err) {
        console.error("[AUTO-ALLOCATE] Error:", err.message);
    }
};

exports.autoAllocateNearestOrder = autoAllocateNearestOrder;

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

        // Trigger Auto-Allocation for the newly freed driver
        if (driver.currentLocation?.coordinates?.length === 2) {
            const driverLoc = {
                latitude: driver.currentLocation.coordinates[1],
                longitude: driver.currentLocation.coordinates[0]
            };
            autoAllocateNearestOrder(driverId, driverLoc, req.app);
        } else {
            console.log(`[AUTO-ALLOCATE] Driver ${driverId} has no valid location for auto-allocation.`);
        }

        // Emit socket event to vendor room for real-time refresh
        const io = req.app.get('io');
        if (io) {
            if (isChatOrder) {
                if (order.vendor) {
                    console.log(`[SOCKET] Emitting order_status_update (Delivered) to vendor: ${order.vendor}`);
                    io.to(order.vendor.toString()).emit('order_status_update', {
                        orderId: order._id.toString(),
                        status: 'Delivered'
                    });
                }
            } else {
                order.vendors.forEach(v => {
                    const vId = v.vendor._id || v.vendor;
                    if (vId) {
                        console.log(`[SOCKET] Emitting order_status_update (Delivered) to vendor: ${vId}`);
                        io.to(vId.toString()).emit('order_status_update', {
                            orderId: order._id.toString(),
                            status: 'Delivered'
                        });
                    }
                });
            }
        }

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
        const { deadlineUTC, startOfTodayIST, now } = getISTMidnight();

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

        // Calculate real-time Pending Earnings (Available Balance - Only for Delivered orders)
        const pendingEarningsRegular = await Order.find({
            driverId: driverId,
            driverEarningStatus: 'Pending',
            deliveredAt: { $ne: null }
        });
        const pendingEarningsChat = await ChatOrder.find({
            driverId: driverId,
            driverEarningStatus: 'Pending',
            deliveredAt: { $ne: null }
        });

        // Use settings for fallback if needed
        const Settings = require('../Settings/model');
        let settings = await Settings.findOne();
        if (!settings) settings = { driverDeliveryFee: { basePay: 30, baseDistance: 5, perKmRate: 10 } };
        const { calculateDeliveryFee } = require('./pricingUtil');

        // Note: Driver Earnings logic
        const calcEarnings = (orders) => orders.reduce((sum, order) => {
            let earning = order.driverDeliveryFee?.totalFee;
            if (earning === undefined || earning === null || earning === 0) {
                // If driverDeliveryFee is missing, fallback to base formula, DO NOT use calculateDeliveryFee as it's for customers
                const distance = order.distance || 0;
                // Basic fallback logic matching calculateDriverDeliveryFee
                const { basePay = 30, baseDistance = 5, perKmRate = 10 } = settings.driverDeliveryFee || {};
                let fallbackEarning = basePay;
                if (distance > baseDistance) {
                    fallbackEarning += (distance - baseDistance) * perKmRate;
                }
                earning = fallbackEarning;
            }
            return sum + earning;
        }, 0);

        const totalPendingEarnings = calcEarnings(pendingEarningsRegular) + calcEarnings(pendingEarningsChat);

        // ===== Today's Progress Logic =====
        const todayRegular = await Order.find({
            driverId: driverId,
            'vendors.orderStatus': 'Delivered',
            deliveredAt: { $gte: deadlineUTC }
        });
        const todayChat = await ChatOrder.find({
            driverId: driverId,
            orderStatus: 'Delivered',
            deliveredAt: { $gte: deadlineUTC }
        });

        const todayOrdersCount = todayRegular.length + todayChat.length;
        const todayEarnings = calcEarnings(todayRegular) + calcEarnings(todayChat);

        // ===== Online Time Logic (HH:mm h format) =====
        let totalMs = driver.totalOnlineTimeToday || 0;
        const lastReset = driver.lastOnlineResetAt ? new Date(driver.lastOnlineResetAt) : null;

        // Reset if it's a new day (IST) OR if data is corrupted (> 24h)
        const isNewDay = !isSameDayIST(lastReset, startOfTodayIST);
        const isInvalidTotal = totalMs > 24 * 60 * 60 * 1000; // Sanity check

        if (isNewDay || isInvalidTotal) {
            console.log(`[ONLINE_TIME] Resetting totalMs for ${driverId}. isNewDay: ${isNewDay}, isInvalidTotal: ${isInvalidTotal}`);
            totalMs = 0;
            await Driver.findByIdAndUpdate(driverId, {
                totalOnlineTimeToday: 0,
                lastOnlineResetAt: startOfTodayIST
            });
        }

        if (driver.isOnline) {
            if (driver.lastOnlineAt) {
                const lastOnlineAt = new Date(driver.lastOnlineAt);
                // If session started before midnight IST, only count from midnight IST
                const effectiveStart = lastOnlineAt < deadlineUTC ? deadlineUTC : lastOnlineAt;
                const currentSession = now.getTime() - effectiveStart.getTime();
                totalMs += (currentSession > 0 ? currentSession : 0);

                console.log(`[ONLINE_TIME] Driver ${driverId} is online. Session start: ${lastOnlineAt.toISOString()}, Current partial: ${currentSession}ms, Total: ${totalMs}ms`);
            } else {
                // Sanity: if online but missing timestamp, set it to now to start recording
                console.log(`[ONLINE_TIME] Driver ${driverId} is online but missing lastOnlineAt. Setting to now.`);
                await Driver.findByIdAndUpdate(driverId, { lastOnlineAt: now });
            }
        } else {
            console.log(`[ONLINE_TIME] Driver ${driverId} is offline. Total bucket: ${totalMs}ms`);
        }

        const formatOnlineTime = (ms) => {
            const totalMinutes = Math.floor(ms / 60000);
            if (totalMinutes < 60) return `${totalMinutes}m`;
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            return `${h}h ${m < 10 ? '0' + m : m}m`;
        };

        res.status(200).json({
            success: true,
            balance: totalPendingEarnings,
            floatingCash: totalFloatingCash,
            isOnline: driver.isOnline || false,
            isPaymentOverdue: overdueOrdersCount > 0,
            overdueCount: overdueOrdersCount,
            overdueAmount: totalOverdueAmount,
            todayEarnings: todayEarnings,
            todayOrders: todayOrdersCount,
            todayOnlineTime: formatOnlineTime(totalMs),
            rejectionCount: driver.rejectionCount || 0,
            isBlocked: driver.isBlocked || false,
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
                    businessName: vendor?.vendorInfo?.businessName || vendor?.name || 'Vendor',
                    vendorShopPhoto: (vendor?.documents?.shopPhoto && vendor.documents.shopPhoto.length > 0) ? vendor.documents.shopPhoto[0] : null,
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
                    businessName: vendor?.vendorInfo?.businessName || vendor?.name || 'Vendor',
                    vendorShopPhoto: (vendor?.documents?.shopPhoto && vendor.documents.shopPhoto.length > 0) ? vendor.documents.shopPhoto[0] : null,
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
                    businessName: vendor?.vendorInfo?.businessName || vendor?.name || 'Vendor',
                    vendorShopPhoto: (vendor?.documents?.shopPhoto && vendor.documents.shopPhoto.length > 0) ? vendor.documents.shopPhoto[0] : null,
                    vendorPhone: vendor?.vendorInfo?.contactNumber || 'N/A',
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
                    businessName: vendor?.vendorInfo?.businessName || vendor?.name || 'Vendor',
                    vendorShopPhoto: (vendor?.documents?.shopPhoto && vendor.documents.shopPhoto.length > 0) ? vendor.documents.shopPhoto[0] : null,
                    vendorPhone: vendor?.vendorInfo?.contactNumber || 'N/A',
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
        // 2b. Fetch rejected offers from OrderAssignment
        const rejectedOffers = await OrderAssignment.find({
            driverId: driverId,
            status: 'rejected'
        }).sort({ updatedAt: -1 }).limit(20);

        const mappedRejected = await Promise.all(rejectedOffers.map(async (offer) => {
            let order = await Order.findById(offer.orderId).lean();
            let isChat = false;
            if (!order) {
                order = await ChatOrder.findById(offer.orderId).lean();
                if (order) isChat = true;
            }
            if (!order) return null;

            const vendorId = isChat ? order.vendor : order.vendors[0].vendor;
            const vendor = await Vendor.findById(vendorId);

            return {
                orderId: order.orderId,
                totalDistance: offer.totalDistance || offer.distance || 0,
                earning: offer.earning || 0,
                status: 'Rejected',
                isOffer: false,
                isRejected: true,
                rejectionReason: offer.rejectionReason,
                isChatOrder: isChat,
                createdAt: order.createdAt,
                updatedAt: offer.updatedAt,
                rawOfferData: {
                    orderId: order.orderId,
                    vendorName: vendor?.name || 'Vendor',
                    ...enrichItemsAndTotal(order, isChat)
                }
            };
        }));

        // Filter out any nulls and merge
        const finalOrders = [
            ...mappedOffers.filter(o => o !== null),
            ...mappedRejected.filter(o => o !== null),
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
