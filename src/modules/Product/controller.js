const Product = require('./model'); // Adjust the path as necessary
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Controller function to add a new product
exports.addProduct = async (req, res) => {
    try {
        const { name, description, category, vendor, availableLocalities, tags, isReturnAllowed } = req.body;
        const images = req.files.filter(file => file.fieldname.startsWith('productImage')).map(file => file.path);
        const variationImages = req.files.filter(file => file.fieldname.startsWith('variationImage'));

       
        const variations = JSON.parse(req.body.variations);

        if (!variations || variations.length === 0) {
            return res.status(400).json({
                message: 'At least one variation is required'
            });
        }

        // Create new product instance first
        const newProduct = new Product({
            name,
            images,
            description,
            category,
            vendor,
            availableLocalities,
            tags,
            isReturnAllowed
        });

        const variationReferences = {};
        const childQuantities = {};

        // Process and format variations
        const formattedVariations = variations.map((variation, index) => {
            const formattedVariation = {
                attributes: variation.attributes,
                price: variation.price?parseInt(variation.price):0,  // Convert price to integer
                discount: variation.discount? parseInt(variation.discount):0,  // Convert discount to integer
                quantity: variation.quantity? parseInt(variation.quantity):0,  // Convert quantity to integer
                images: variationImages.filter(file => file.fieldname.includes(`variationImage_${index}`)).map(file => file.path) ,  // Assign the corresponding images
                parentVariation: null,  // Initialize parentVariation as null,
            };

            if (variation.parentVariation !== null && variation.parentVariation !== '') {
                const parentIndex = variation.parentVariation.match(/\d+/)[0];
                if (variationReferences[parentIndex]) {
                    formattedVariation.parentVariation = variationReferences[parentIndex]._id;
                    if (!childQuantities[parentIndex]) {
                        childQuantities[parentIndex] = 0;
                    }
                    childQuantities[parentIndex] += formattedVariation.quantity;
                } else {
                    return res.status(400).json({
                        message: `Parent variation not found for: ${variation.parentVariation}`
                    });
                }
            }

            const createdVariation = newProduct.variations.create(formattedVariation);
            variationReferences[index + 1] = createdVariation;

            return createdVariation;
        });

        for (const parentIndex in childQuantities) {
            if (childQuantities[parentIndex] > variationReferences[parentIndex].quantity) {
                return res.status(400).json({
                    message: `Sum of child quantities exceeds parent quantity for parent variation: ${parentIndex}`
                });
            }
        }

        newProduct.variations = formattedVariations;
        newProduct.price = formattedVariations[0].price;
        newProduct.discount = formattedVariations[0].discount;
        newProduct.quantity = variations.reduce((sum, variation) => sum + parseInt(variation.quantity), 0);

        const savedProduct = await newProduct.save();

        res.status(201).json({
            message: 'Product created successfully',
            product: savedProduct
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to create product',
            error: error.message
        });
    }
};



// Controller function to update an existing product
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            price,
            discount,
            description,
            category,
            vendor,
            availableLocalities,
            tags,
            isReturnAllowed,
            variations,
            existingImages,
            existingVariationImages
        } = req.body;

        console.log("tags-->>", tags)

        // Find the product by ID
        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        // Delete product images from the file system that are not in existingImages
        product.images.forEach(imagePath => {
            if (!existingImages?.includes(imagePath)) {
                const fullPath = path.join(imagePath); // Adjust the path accordingly
                fs.unlink(fullPath, err => {
                    if (err) {
                        console.error(`Failed to delete image file: ${fullPath}`, err);
                    }
                });
            }
        });

        // Parse and process the variations array
        const parsedVariations = JSON.parse(variations);
        const variationMap = {}; // To store parent variations by their attributes

        // First, add all parent variations to the map, generating IDs if they do not exist
        parsedVariations.forEach(variation => {
            if (variation.parentVariation === null) {
                const key = `${variation.attributes.selected}:${variation.attributes.value}`;
                variation._id = variation._id ? new mongoose.Types.ObjectId(variation._id) : new mongoose.Types.ObjectId();
                variationMap[key] = variation._id;
            }
        });

        // Validate and structure the variations array
        const formattedVariations = parsedVariations.map(variation => {
            let parentVariationId = null;
            if (variation.parentVariation && !mongoose.Types.ObjectId.isValid(variation.parentVariation)) {
                const parentAttr = variation.parentVariation.split(' - ');
                if (parentAttr.length === 2) {
                    const parentAttr1 = parentAttr[1].split(": ")
                    const key = `${parentAttr1[0]}:${parentAttr1[1]}`
                    parentVariationId = variationMap[key];
                }
            } else {
                parentVariationId = variation.parentVariation ? new mongoose.Types.ObjectId(variation.parentVariation) : null;
            }

            return {
                attributes: variation.attributes,
                price: variation.price ? parseInt(variation.price):0,
                discount: variation.discount? parseInt(variation.discount):0,
                quantity: variation.quantity?parseInt(variation.quantity):0,
                parentVariation: parentVariationId ? new mongoose.Types.ObjectId(parentVariationId) : null,
                _id: variation._id ? new mongoose.Types.ObjectId(variation._id) : new mongoose.Types.ObjectId(),
                images: []
            };
        });

        // Calculate total quantity and validate child quantities
        const parentQuantities = {};
        formattedVariations.forEach(variation => {
            if (variation.parentVariation) {
                const parentId = variation.parentVariation.toString();
                if (!parentQuantities[parentId]) {
                    parentQuantities[parentId] = 0;
                }
                parentQuantities[parentId] += variation.quantity;
            }
        });

        // Check if any child quantities exceed their parent quantities
        for (const [parentId, totalChildQuantity] of Object.entries(parentQuantities)) {
            const parentVariation = formattedVariations.find(variation => variation._id.toString() === parentId);
            if (parentVariation && totalChildQuantity > parentVariation.quantity) {
                return res.status(400).json({
                    message: `Total quantity of child variations (${totalChildQuantity}) exceeds parent variation quantity (${parentVariation.quantity}) for parent variation ID: ${parentId}`
                });
            }
        }

        // Calculate total quantity for the product
        const totalQuantity = formattedVariations.reduce((sum, variation) => {
            if (variation.parentVariation === null) {
                return sum + variation.quantity;
            }
            return sum;
        }, 0);

        // Update the product details
        product.name = name || product.name;
        product.price = price? parseInt(price) || formattedVariations[0].price : 0
        product.discount = parseInt(discount) || formattedVariations[0].discount;
        product.description = description || product.description;
        product.category = category || product.category;
        product.vendor = vendor || product.vendor;
        product.availableLocalities = availableLocalities || product.availableLocalities;
        product.tags = tags? tags :[],
        product.isReturnAllowed = isReturnAllowed || product.isReturnAllowed;
        product.quantity = totalQuantity;

        console.log("req.files-->>", req.files)

        // Handle new product images and variation images
        if (req.files && req.files.length > 0) {
            const newImages = req.files.filter(file => file.fieldname.startsWith('productImage')).map(file => file.path);
            product.images = existingImages ? existingImages.concat(newImages) : newImages;

            req.files.forEach(file => {
                if (file.fieldname.startsWith('variationImage_')) {
                    const [variationIndex, imageIndex] = file.fieldname.split('_').slice(1).map(Number);
                    if (formattedVariations[variationIndex]) {
                        formattedVariations[variationIndex].images[imageIndex] = file.path;
                    }
                }
            });
        } else {
            product.images = existingImages || product.images;
        }

        // Handle existing variation images
        if (existingVariationImages) {
            existingVariationImages.forEach((imageList, variationIndex) => {
                if (formattedVariations[variationIndex]) {
                    imageList.forEach((image, imageIndex) => {
                        formattedVariations[variationIndex].images[imageIndex] = image;
                    });
                }
            });
        }

        // Update variations
        product.variations = formattedVariations;

        // Save the updated product to the database
        const updatedProduct = await product.save();

        // Send response
        res.status(200).json({
            message: 'Product updated successfully',
            product: updatedProduct
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to update product',
            error: error.message
        });
    }
};






// Controller function to get all products
exports.getAllProductsVendor = async (req, res) => {
    try {
        const vendorId = req.params.vendorId;

        // Find all products and populate the category field
        const products = await Product.find({ vendor: vendorId }).populate('category');

        // Send response with the products
        res.status(200).json({
            message: 'Products retrieved successfully',
            products
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to retrieve products',
            error: error.message
        });
    }
};

exports.getAllProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const userLocation = req.query.userLocation;

        // Construct the filter for availableLocalities
        const locationFilter = userLocation ? { availableLocalities: { $in: [userLocation, 'all'] }, quantity: { $gt: 0 } } : { quantity: { $gt: 0 } };

        // Find the most recently added products with the location filter
        const products = await Product.find(locationFilter)
            .skip((page - 1) * limit)
            .limit(limit);

        // Count the total number of products with the location filter
        const totalProducts = await Product.countDocuments(locationFilter);

        res.json({
            total: totalProducts,
            page,
            limit,
            products
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Controller to get products with low quantity
exports.getProductsLowQuantity = async (req, res) => {
    try {
        const vendorId = req.params.vendorId; // Extract vendorId from request params

        // Find products for the specified vendor
        const products = await Product.find({ vendor: vendorId }).lean();

        // Filter products where parent variation quantity is less than 10
        const lowQuantityProducts = products.filter(product => {
            return product.variations.some(variation => !variation.parentVariation && variation.quantity < 10);
        });

        // Include child variations for filtered products
        const result = lowQuantityProducts.map(product => {
            const parentVariations = product.variations.filter(variation => !variation.parentVariation && variation.quantity < 10);
            const childVariations = product.variations.filter(variation => parentVariations.some(parent => parent._id.equals(variation.parentVariation)));
            return {
                ...product,
                variations: [...parentVariations, ...childVariations]
            };
        });

        res.json(result);

    } catch (error) {
        console.error("Error fetching low quantity products:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};






// Controller function to get a product by ID
exports.getProductById = async (req, res) => {
    console.log("getProductById->>", req.params.id)

    try {
        const { id } = req.params;


        // Find the product by ID and populate the category field
        const product = await Product.findById(id)

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        // Send the product in the response
        res.status(200).json({
            message: 'Product retrieved successfully',
            product
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to retrieve product',
            error: error.message
        });
    }
};





// Controller function to delete a product by ID
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // Find the product by ID
        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        // Delete product images from the file system
        product.images.forEach(imagePath => {
            const fullPath = path.join(imagePath);
            fs.unlink(fullPath, err => {
                if (err) {
                    console.error(`Failed to delete image file: ${fullPath}`, err);
                }
            });
        });

        // Delete the product from the database
        const deletedProduct = await Product.findByIdAndDelete(id);

        // Send response confirming deletion
        res.status(200).json({
            message: 'Product deleted successfully',
            product: deletedProduct
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to delete product',
            error: error.message
        });
    }
};


// Controller function to get products by Category ID with pagination
exports.getProductsByCategoryId = async (req, res) => {
    try {
        const categoryId = req.params.id; // Assuming 'id' is the category ID
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const userLocation = req.query.userLocation;

        // Define the match criteria for products
        const matchCriteria = {
            category: new mongoose.Types.ObjectId(categoryId),
            availableLocalities: { $in: [userLocation, 'all'] },
            quantity: { $gt: 0 } // Ensure quantity is greater than 0
        };

        // Perform the aggregation query
        const products = await Product.aggregate([
            { $match: matchCriteria },
            { $sample: { size: limit } }, // Randomly sample 'limit' number of documents
            { $skip: (page - 1) * limit }, // Skip documents for pagination
            { $limit: limit } // Limit the number of documents returned
        ]);

        // Count the total number of products in the category with the specified location filter
        const totalProducts = await Product.countDocuments(matchCriteria);

        // Send the products in the response with pagination metadata
        res.status(200).json({
            total: totalProducts,
            page,
            limit,
            products
        });
    } catch (error) {
        console.error('Error retrieving products:', error);
        res.status(500).json({
            message: 'Failed to retrieve products',
            error: error.message
        });
    }
};

// Get similar products based on the same category
exports.getSimilarProducts = async (req, res) => {
    try {
        console.log("api call")
        const productId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const userLocation = req.query.userLocation;

        // Find the product by ID
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Find other products in the same category, excluding the current product
        const similarProducts = await Product.find({
            category: product.category,
            availableLocalities: { $in: [userLocation, 'all'] },
            quantity: { $gt: 0 },
            _id: { $ne: productId }
        })
            .skip((page - 1) * limit)
            .limit(limit);

        const totalSimilarProducts = await Product.countDocuments({
            category: product.category,
            availableLocalities: { $in: [userLocation, 'all'] },
            quantity: { $gt: 0 },
            _id: { $ne: productId }
        });

        res.json({
            total: totalSimilarProducts,
            page,
            limit,
            products: similarProducts
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//Recently added Products
exports.getRecentlyAddedProducts = async (req, res) => {

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const userLocation = req.query.userLocation;

        // Construct the filter for availableLocalities
        const locationFilter = userLocation ? { availableLocalities: { $in: [userLocation, 'all'] }, quantity: { $gt: 0 } } : { quantity: { $gt: 0 } };

        // Find the most recently added products with the location filter
        const recentlyAddedProducts = await Product.find(locationFilter)
            .sort({ createdAt: -1 }) // Sort by creation date in descending order
            .skip((page - 1) * limit)
            .limit(limit);

        // Count the total number of products with the location filter
        const totalRecentlyAddedProducts = await Product.countDocuments(locationFilter);

        res.json({
            total: totalRecentlyAddedProducts,
            page,
            limit,
            products: recentlyAddedProducts
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

//On-discount Products
exports.getDiscountedProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const userLocation = req.query.userLocation;

        // Construct the filter for availableLocalities
        const locationFilter = userLocation ? { availableLocalities: { $in: [userLocation, 'all'] }, quantity: { $gt: 0 } } : { quantity: { $gt: 0 } };

        // Combine the discount filter with the location filter
        const query = {
            discount: { $gt: 0 },
            ...locationFilter
        };

        console.log("query-->>", query)

        // Find products that have a discount greater than 0 and match the location filter
        const discountedProducts = await Product.find(query)
            .sort({ discount: -1 }) // Optionally, sort by the highest discount first
            .skip((page - 1) * limit)
            .limit(limit);

        const totalDiscountedProducts = await Product.countDocuments(query);

        res.json({
            total: totalDiscountedProducts,
            page,
            limit,
            products: discountedProducts
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



//Fuzzy Search
// controller.js
exports.fuzzySearchProducts = async (req, res) => {
    const { searchQuery, page = 1, limit = 10, userLocation } = req.query;

    try {
        // Build the regex query for partial matches
        const regexQuery = new RegExp(searchQuery, 'i'); // 'i' for case-insensitive

        // Construct the filter for availableLocalities
        const locationFilter = userLocation ? { availableLocalities: { $in: [userLocation, 'all'] }, quantity: { $gt: 0 } } : { quantity: { $gt: 0 } };

        // Combine the search query with the location filter
        const query = {
            ...locationFilter,
            $or: [
                { name: { $regex: regexQuery } },
                { description: { $regex: regexQuery } },
                { tags: { $regex: regexQuery } } // Include tags in the search
            ]
        };

        // Find products that match the search query in the 'name', 'description' or 'tags', and match the location filter
        const results = await Product.find(query)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const totalResults = await Product.countDocuments(query);

        res.json({
            total: totalResults,
            page: parseInt(page),
            limit: parseInt(limit),
            products: results
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



exports.updateVariationQuantity = async (req, res) => {
    try {
        const { productId, variationId } = req.params;
        const { quantity } = req.body;

        // Find the product by ID
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        // Find the variation by ID within the product's variations array
        const variation = product.variations.id(variationId);

        if (!variation) {
            return res.status(404).json({
                message: 'Variation not found'
            });
        }

        // Find the parent variation if exists
        const parentVariation = variation.parentVariation ? product.variations.id(variation.parentVariation) : null;

        // If the variation has a parent, check if the total quantity of all child variations exceeds the parent's quantity
        if (parentVariation) {
            // Update the quantity of the found variation
            variation.quantity = quantity;

            // Find all child variations of the parent variation
            const childVariations = product.variations.filter(v =>
                v.parentVariation && v.parentVariation.equals(parentVariation._id)
            );

            // Calculate the total quantity of all child variations including the current variation
            const totalChildQuantity = childVariations.reduce((sum, v) => sum + v.quantity, 0);

            if (totalChildQuantity > parentVariation.quantity) {
                return res.status(400).json({
                    message: 'Total quantity of child variations cannot exceed parent variation quantity'
                });
            }
        } else {
            // Update the quantity of the variation if it's a parent variation
            variation.quantity = quantity;
        }

        // Recalculate the root level quantity field
        const totalQuantity = product.variations.reduce((sum, v) =>
            v.parentVariation === null ? sum + v.quantity : sum, 0);

        product.quantity = totalQuantity;

        // Save the updated product to the database
        const updatedProduct = await product.save();

        // Send response
        res.status(200).json({
            message: 'Variation quantity updated successfully',
            product: updatedProduct
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Failed to update variation quantity',
            error: error.message
        });
    }
};






