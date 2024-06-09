const Product = require('./model'); // Adjust the path as necessary
const fs = require('fs');
const path = require('path');

// Controller function to add a new product
exports.addProduct = async (req, res) => {
    console.log("Request body:", req.body);
    console.log("Uploaded files:", req.files);

    try {
        const { name, price, discount, description, category, vendor, availableLocalities, quantity } = req.body;
        const images = req.files.map(file => file.path); // Get the paths of the uploaded images

        console.log("vendor--->>>", vendor)

        // Create a new product instance
        const newProduct = new Product({
            name,
            images,
            price,
            discount,
            description,
            category,
            vendor,
            availableLocalities,
            quantity
        });

        // Save the product to the database
        const savedProduct = await newProduct.save();

        // Send response
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

// Controller function to get all products
exports.getAllProducts = async (req, res) => {
    try {
        // Find all products and populate the category field
        const products = await Product.find().populate('category');

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

// Controller to get products with low quantity
exports.getProductsLowQuantity = async (req, res) => {
    try {
        const vendorId = req.params.vendorId; // Extract vendorId from request params

        // Find products with quantity below 10 for the specified vendor
        const lowQuantityProducts = await Product.find({ vendor: vendorId, quantity: { $lt: 10 } });

        res.status(200).json(lowQuantityProducts);
    } catch (error) {
        console.error("Error fetching low quantity products:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// Controller function to get a product by ID
exports.getProductById = async (req, res) => {
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

// Controller function to update an existing product
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, discount, description, category, existingImages, vendor, availableLocalities, quantity } = req.body;

        // Find the product by ID
        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        // Update the product details
        product.name = name || product.name;
        product.price = price || product.price;
        product.discount = discount || product.discount;
        product.description = description || product.description;
        product.category = category || product.category;
        product.vendor = vendor || product.vendor;
        product.availableLocalities = availableLocalities || product.availableLocalities;
        product.quantity = quantity || product.quantity;

        // Combine existing images and new uploaded images if there are new images
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => file.path);
            product.images = existingImages ? existingImages.concat(newImages) : newImages;
        } else {
            product.images = existingImages || product.images;
        }

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

        // Find all products that belong to the given category ID and filter by userLocation
        const products = await Product.find({
            category: categoryId,
            availableLocalities: { $in: [userLocation, 'all'] },
            quantity: { $gt: 0 } // Add this filter to ensure quantity is greater than 0
        })
            .skip((page - 1) * limit)
            .limit(limit);


        // Count the total number of products in the category with the specified location filter
        const totalProducts = await Product.countDocuments({
            category: categoryId,
            availableLocalities: { $in: [userLocation, 'all'] },
            quantity: { $gt: 0 }
        });

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
                { description: { $regex: regexQuery } }
            ]
        };

        // Find products that match the search query in the 'name' or 'description' and match the location filter
        const results = await Product.find(query)
        // .skip((page - 1) * limit)
        // .limit(parseInt(limit));

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




