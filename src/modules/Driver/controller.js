const Driver = require("./model");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const Settings = require("../Settings/model");

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
        const { phone, password } = req.body;

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

        // Set driver online status to true upon successful login
        await Driver.findByIdAndUpdate(driver._id, { isOnline: true });

        res.status(200).json({
            message: "Login successful",
            token,
            driver: {
                _id: driver._id,
                name: driver.personalDetails.name,
                phone: driver.personalDetails.phone,
                role: driver.role,
                isOnline: true, // Echo back the status
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

        // Context Detection: If 'res' is not a response object, it's an internal call handled by passing (vendorId)
        if (!res || typeof res.status !== 'function') {
            isInternal = true;
            vendorId = req; // In internal calls, the first argument is vendorId
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

        // --- SIMULATION MODE CHECK (Only for API calls with parameters) ---
        const testDrivers = [];
        if (!isInternal && req && req.body) {
            for (let i = 1; i <= 10; i++) {
                const locKey = `${i}driverLocation`;
                if (req.body[locKey]) {
                    testDrivers.push({
                        name: `Driver ${i}`,
                        location: req.body[locKey],
                        isOnline: req.body[`${i}driverOnline`] !== undefined ? req.body[`${i}driverOnline`] : true,
                        approvalStatus: req.body[`${i}driverStatus`] || 'approved',
                        isFree: req.body[`${i}driverFree`] !== undefined ? req.body[`${i}driverFree`] : true
                    });
                }
            }
        }

        const { calculateDistance } = require("./pricingUtil");
        const Settings = require("../Settings/model");
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({ vendorVisibilityRadius: 10, driverSearchRadius: 5 });
        }

        if (testDrivers.length > 0) {
            // Processing Simulation Drivers
            const finalRadius = searchRadius || settings.driverSearchRadius || 5;
            const allValidResults = testDrivers.map(d => {
                const distance = calculateDistance(searchLat, searchLon, d.location.latitude, d.location.longitude);
                const passesQualityTest = d.isOnline === true && d.approvalStatus === 'approved' && d.isFree === true;
                return {
                    ...d,
                    distance: Number(distance.toFixed(2)),
                    passesQualityTest
                };
            })
                .filter(d => d.passesQualityTest && d.distance <= finalRadius)
                .sort((a, b) => a.distance - b.distance);

            let tiedNearestDrivers = [];
            if (allValidResults.length > 0) {
                const minDistance = allValidResults[0].distance;
                tiedNearestDrivers = allValidResults.filter(d => d.distance === minDistance);
            }

            if (isInternal) return tiedNearestDrivers.map(d => d._id);

            return res.status(200).json({
                success: true,
                vendorLocation: { latitude: searchLat, longitude: searchLon },
                radiusLimit: finalRadius,
                count: tiedNearestDrivers.length,
                results: tiedNearestDrivers.map(({ passesQualityTest, ...rest }) => rest)
            });
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
            }
        }));

        // Resolve DB ObjectId if orderId is a 6-digit code for database persistence
        let dbOrderId = orderId;
        if (orderId && !require('mongoose').Types.ObjectId.isValid(orderId)) {
            const Order = require('../Order/model');
            const foundOrder = await Order.findOne({ orderId: orderId });
            if (foundOrder) dbOrderId = foundOrder._id;
        }

        // Trigger Socket Event to found drivers
        if (results.length > 0) {
            console.log(`[SOCKET] Found ${results.length} drivers: ${results.map(d => d.name).join(', ')}`);
            const io = (req && req.app) ? req.app.get("io") : null;
            const OrderAssignment = require('./orderAssignment.model');

            results.forEach(async (driver) => {
                const roomId = driver.id.toString();

                // Save assignment to DB for persistence
                try {
                    await OrderAssignment.findOneAndUpdate(
                        { orderId: dbOrderId, driverId: driver.id },
                        { orderId: dbOrderId, driverId: driver.id, distance: driver.distance, status: 'pending' },
                        { upsert: true, new: true }
                    );
                } catch (err) {
                    console.error("OrderAssignment save error:", err);
                }

                if (io) {
                    io.to(roomId).emit("new_order_offer", {
                        orderId,
                        vendorLocation: { latitude: searchLat, longitude: searchLon },
                        distance: driver.distance
                    });
                }
            });
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
    try {
        const {
            currentLocation,
            pickupLocation,
            dropLocation,
            vendors,
            shippingAddress
        } = req.body;

        // Fetch settings
        const Settings = require("../Settings/model");
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({ vendorVisibilityRadius: 10 });
        }

        const { calculateDistance, calculateDeliveryFee, calculateDriverDeliveryFee } = require("./pricingUtil");

        // NEW FORMAT (from Customer App): vendors array and shippingAddress
        if (vendors && Array.isArray(vendors) && shippingAddress) {
            if (!shippingAddress.latitude || !shippingAddress.longitude) {
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

                console.log(`Calculating for Vendor: ${vendor.name}, Coords: [${vendor.location.coordinates[1]}, ${vendor.location.coordinates[0]}]`);
                console.log(`Shipping Address Coords: [${shippingAddress.latitude}, ${shippingAddress.longitude}]`);

                const distance = calculateDistance(
                    vendor.location.coordinates[1], // latitude
                    vendor.location.coordinates[0], // longitude
                    shippingAddress.latitude,
                    shippingAddress.longitude
                );

                console.log(`Calculated Distance: ${distance.toFixed(2)} km`);

                const charge = calculateDeliveryFee(distance, settings);

                charges.push({
                    vendorId,
                    vendorName: vendor.name,
                    distance: Number(distance.toFixed(2)),
                    charge: Number(charge.toFixed(2))
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
        if (currentLocation && pickupLocation && dropLocation) {
            // Validate input
            if (!currentLocation.latitude || !currentLocation.longitude ||
                !pickupLocation.latitude || !pickupLocation.longitude ||
                !dropLocation.latitude || !dropLocation.longitude) {
                return res.status(400).json({
                    error: "Each location must have latitude and longitude"
                });
            }

            // Calculate driver delivery fee
            const feeBreakdown = calculateDriverDeliveryFee(
                currentLocation,
                pickupLocation,
                dropLocation,
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
        console.error("Error calculating delivery fee:", error);
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
        const order = await Order.findOne({ orderId: orderId });

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

        // Update order status to 'Shipped' (Out for Delivery)
        await Order.updateOne(
            { orderId: orderId },
            {
                $set: {
                    'vendors.$[].orderStatus': 'Shipped'
                }
            }
        );

        res.status(200).json({
            success: true,
            message: 'Pickup verified successfully. Order is now out for delivery.'
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
        // Generate 4 digit OTP
        const deliveryOtp = Math.floor(1000 + Math.random() * 9000);

        const order = await Order.findOneAndUpdate(
            { orderId: orderId, driverId: driverId },
            { $set: { deliveryOtp: deliveryOtp } },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found or driver not matched'
            });
        }

        // TODO: Integrate SMS service to send OTP to customer
        console.log(`\n************************************`);
        console.log(`[DELIVERY OTP] Order: ${orderId}`);
        console.log(`[DELIVERY OTP] OTP Sent to Customer: ${deliveryOtp}`);
        console.log(`************************************\n`);

        res.status(200).json({
            success: true,
            message: 'OTP has been sent to the customer.'
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
        const order = await Order.findOne({ orderId: orderId });

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

        // Get delivery fee (assuming it's stored or calculated)
        const deliveryFee = order.deliveryCharge || 0;

        // Update order status to 'Delivered'
        await Order.updateOne(
            { orderId: orderId },
            {
                $set: {
                    'vendors.$[].orderStatus': 'Delivered'
                }
            }
        );

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

        res.status(200).json({
            success: true,
            balance: driver.walletBalance || 0
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
        const driver = await Driver.findById(driverId).populate('currentOrderId');

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        if (!driver.currentOrderId) {
            return res.status(200).json({
                success: true,
                hasActiveOrder: false
            });
        }

        const order = driver.currentOrderId;
        const status = order.vendors[0]?.orderStatus;
        const Vendor = require('../Vendor/model');
        const vendor = await Vendor.findById(order.vendors[0].vendor);

        const reconstructedOrder = {
            orderId: order.orderId,
            totalDistance: order.driverDeliveryFee?.totalDistance || 0,
            earning: order.driverDeliveryFee?.totalFee || 0,
            status: status,
            rawOfferData: {
                orderId: order.orderId,
                pickupLocation: vendor ? {
                    latitude: vendor.location.coordinates[1],
                    longitude: vendor.location.coordinates[0]
                } : null,
                dropLocation: {
                    latitude: order.shippingAddress.latitude,
                    longitude: order.shippingAddress.longitude
                },
                shippingAddress: order.shippingAddress,
                customerName: order.shippingAddress?.name || order.name,
                customerPhone: order.shippingAddress?.phone
            }
        };

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
        const Vendor = require('../Vendor/model');
        const OrderAssignment = require('./orderAssignment.model');

        // 1. Fetch currently active orders assigned to driver
        const activeOrders = await Order.find({
            driverId: driverId,
            'vendors.orderStatus': { $in: ['Processing', 'Shipped'] }
        }).sort({ createdAt: -1 });

        const mappedActive = await Promise.all(activeOrders.map(async (order) => {
            const status = order.vendors[0]?.orderStatus;
            const vendor = await Vendor.findById(order.vendors[0].vendor);

            return {
                orderId: order.orderId,
                totalDistance: order.driverDeliveryFee?.totalDistance || 0,
                earning: order.driverDeliveryFee?.totalFee || 0,
                status: status,
                isOffer: false,
                rawOfferData: {
                    orderId: order.orderId,
                    pickupLocation: vendor ? {
                        latitude: vendor.location.coordinates[1],
                        longitude: vendor.location.coordinates[0]
                    } : null,
                    dropLocation: {
                        latitude: order.shippingAddress.latitude,
                        longitude: order.shippingAddress.longitude
                    },
                    shippingAddress: order.shippingAddress,
                    customerName: order.shippingAddress?.name || order.name,
                    customerPhone: order.shippingAddress?.phone
                }
            };
        }));

        // 2. Fetch pending offers from OrderAssignment
        const pendingOffers = await OrderAssignment.find({
            driverId: driverId,
            status: 'pending'
        }).populate('orderId').sort({ createdAt: -1 });

        const mappedOffers = await Promise.all(pendingOffers.map(async (offer) => {
            const order = offer.orderId;
            // If order doesn't exist or already has a driver, it's no longer a valid offer
            if (!order || order.driverId) {
                // Background cleanup: mark as expired so it doesn't show up next time
                if (offer.status === 'pending') {
                    await OrderAssignment.findByIdAndUpdate(offer._id, { status: 'expired' });
                }
                return null;
            }

            const vendor = await Vendor.findById(order.vendors[0].vendor);

            return {
                orderId: order.orderId,
                totalDistance: offer.distance || 0,
                earning: order.driverDeliveryFee?.totalFee || 0,
                status: 'Offer',
                isOffer: true,
                rawOfferData: {
                    orderId: order.orderId,
                    pickupLocation: vendor ? {
                        latitude: vendor.location.coordinates[1],
                        longitude: vendor.location.coordinates[0]
                    } : null,
                    dropLocation: {
                        latitude: order.shippingAddress.latitude,
                        longitude: order.shippingAddress.longitude
                    },
                    shippingAddress: order.shippingAddress,
                    customerName: order.shippingAddress?.name || order.name,
                    customerPhone: order.shippingAddress?.phone
                }
            };
        }));

        // Filter out any nulls and merge
        const finalOrders = [...mappedOffers.filter(o => o !== null), ...mappedActive];

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

module.exports = exports;
