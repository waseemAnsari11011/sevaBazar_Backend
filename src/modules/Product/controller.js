const mongoose = require("mongoose");
const Category = require("../Category/model");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Product, ProductVariation } = require("./model");

// Configure AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Helper function to delete S3 objects
const deleteS3Object = async (key) => {
  try {
    const deleteParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));
    console.log(`Successfully deleted ${key} from S3`);
  } catch (error) {
    console.error(`Failed to delete ${key} from S3:`, error);
  }
};

// Helper function to extract S3 key from URL
const extractS3KeyFromUrl = (url) => {
  if (typeof url !== "string") return null;

  // If it's already a key (starts with folder name)
  if (url.startsWith("products/")) {
    return url;
  }

  // If it's a full S3 URL, extract the key
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  const patterns = [
    `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/`,
    `https://${bucketName}.s3.amazonaws.com/`,
    `https://s3.${process.env.AWS_REGION}.amazonaws.com/${bucketName}/`,
    `https://s3.amazonaws.com/${bucketName}/`,
  ];

  for (const pattern of patterns) {
    if (url.startsWith(pattern)) {
      return url.substring(pattern.length);
    }
  }

  return null;
};

exports.addProduct = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      name,
      description,
      vendor,
      vendorProductCategory,
      tags,
      isReturnAllowed,
      isVisible,
      arrivalDuration,
      variations: variationsJSON,
    } = req.body;

    // ... (rest of the function is good)

    const newProduct = new Product({
      name,
      description,
      vendor,
      vendorProductCategory,
      tags,
      isReturnAllowed,
      isVisible,
      arrivalDuration,
      variations: [],
    });

    // ... (rest of the function is correct)

    // --- The rest of your addProduct function is correct ---
    const allVariationImages = req.files ? Object.values(req.files).flat() : [];
    const variationsData = JSON.parse(variationsJSON);
    if (!variationsData || variationsData.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "At least one variation is required" });
    }
    const variationsToCreate = variationsData.map((variation, index) => {
      const images = allVariationImages
        .filter((file) => file.fieldname.startsWith(`variationImage_${index}`))
        .map((file) => file.location);
      return {
        product: newProduct._id,
        attributes: variation.attributes,
        price: variation.price,
        discount: variation.discount,
        quantity: variation.quantity,
        images: images,
      };
    });
    const savedVariations = await ProductVariation.insertMany(
      variationsToCreate,
      { session }
    );
    newProduct.variations = savedVariations.map((v) => v._id);
    const savedProduct = await newProduct.save({ session });
    await session.commitTransaction();
    res.status(201).json({
      message: "Product and its variations created successfully",
      product: savedProduct,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Transaction Error:", error);
    res
      .status(500)
      .json({ message: "Failed to create product", error: error.message });
  } finally {
    session.endSession();
  }
};

exports.updateProductDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const allowedUpdates = {
      name: req.body.name,
      description: req.body.description,
      vendor: req.body.vendor,
      vendorProductCategory: req.body.vendorProductCategory,
      tags: req.body.tags,
      isReturnAllowed: req.body.isReturnAllowed,
      isVisible: req.body.isVisible,
      arrivalDuration: req.body.arrivalDuration,
    };

    Object.keys(allowedUpdates).forEach(
      (key) => allowedUpdates[key] === undefined && delete allowedUpdates[key]
    );

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({
      message: "Product details updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Failed to update product details:", error);
    res.status(500).json({
      message: "Failed to update product details",
      error: error.message,
    });
  }
};

// =================================================================
// ADD NEW VARIATION to an existing product
// =================================================================
exports.addVariation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params; // Product ID
    const { attributes, price, discount, quantity } = req.body;

    const product = await Product.findById(id).session(session);
    if (!product) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Product not found" });
    }

    // This logic correctly handles the new schema.
    // When sending an array of objects via multipart/form-data,
    // it's best practice to JSON.stringify() it on the client.
    // This line parses it back into the required array of objects.
    const parsedAttributes =
      typeof attributes === "string" ? JSON.parse(attributes) : attributes;

    const images = req.files?.newImages
      ? req.files.newImages.map((file) => file.location)
      : [];

    const newVariation = new ProductVariation({
      product: product._id,
      attributes: parsedAttributes, // Will be [{name: "...", value: "..."}, ...]
      price: parseFloat(price),
      discount: parseFloat(discount) || 0,
      quantity: parseInt(quantity) || 0,
      images: images,
    });

    const savedVariation = await newVariation.save({ session });

    product.variations.push(savedVariation._id);
    await product.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      message: "Variation added successfully",
      variation: savedVariation,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Failed to add variation:", error);
    res.status(500).json({
      message: "Failed to add variation",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// =================================================================
// Update a specific, existing variation
// =================================================================
exports.updateVariation = async (req, res) => {
  try {
    const { variationId } = req.params;
    const { price, discount, quantity, attributes } = req.body;

    const variation = await ProductVariation.findById(variationId);
    if (!variation) {
      return res.status(404).json({ message: "Variation not found" });
    }

    // Handle Image Updates
    const existingImages = JSON.parse(req.body.existingImages || "[]");
    const newImages = req.files.newImages
      ? req.files.newImages.map((file) => file.location)
      : [];

    // Determine which images to delete from S3
    const imagesToDelete = variation.images.filter(
      (url) => !existingImages.includes(url)
    );

    if (imagesToDelete.length > 0) {
      await Promise.all(
        imagesToDelete.map((url) => {
          const s3Key = extractS3KeyFromUrl(url);
          if (s3Key) return deleteS3Object(s3Key);
          return Promise.resolve();
        })
      );
    }

    // Update fields
    variation.price = price;
    variation.discount = discount;
    variation.quantity = quantity;
    variation.images = [...existingImages, ...newImages];

    // Just like in addVariation, this correctly parses the stringified array
    // of attribute objects from the form data.
    if (attributes) {
      variation.attributes = JSON.parse(attributes);
    }

    const updatedVariation = await variation.save();

    res.status(200).json({
      message: "Variation updated successfully",
      variation: updatedVariation,
    });
  } catch (error) {
    console.error("Failed to update variation:", error);
    res.status(500).json({
      message: "Failed to update variation",
      error: error.message,
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
        message: "Product not found",
      });
    }

    // Delete the product from the database
    const deletedProduct = await Product.findByIdAndDelete(id);

    // Send response confirming deletion
    res.status(200).json({
      message: "Product deleted successfully",
      product: deletedProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to delete product",
      error: error.message,
    });
  }
};

// Controller function to get all products
exports.getAllProductsVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    // Find all products and populate variations and vendorProductCategory
    const products = await Product.find({ vendor: vendorId })
      .populate("variations")
      .populate("vendorProductCategory")
      .sort({ createdAt: -1 });

    // Send response with the complete product and variation data
    res.status(200).json({
      message: "Products and their variations retrieved successfully",
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve products",
      error: error.message,
    });
  }
};

// Controller to get products with low quantity
exports.getProductsLowQuantity = async (req, res) => {
  try {
    const vendorId = req.params.vendorId; // Extract vendorId from request params

    // Find products for the specified vendor
    const products = await Product.find({ vendor: vendorId }).lean();

    // Filter products where parent variation quantity is less than 10
    const lowQuantityProducts = products.filter((product) => {
      return product.variations.some(
        (variation) => !variation.parentVariation && variation.quantity < 10
      );
    });

    // Include child variations for filtered products
    const result = lowQuantityProducts.map((product) => {
      const parentVariations = product.variations.filter(
        (variation) => !variation.parentVariation && variation.quantity < 10
      );
      const childVariations = product.variations.filter((variation) =>
        parentVariations.some((parent) =>
          parent._id.equals(variation.parentVariation)
        )
      );
      return {
        ...product,
        variations: [...parentVariations, ...childVariations],
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
  try {
    const { id } = req.params;

    // Find the product and populate its variations and vendorProductCategory
    const product = await Product.findById(id)
      .populate("variations")
      .populate("vendorProductCategory");

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    // Send the complete product object in the response
    res.status(200).json({
      message: "Product retrieved successfully",
      product,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve product",
      error: error.message,
    });
  }
};

// Shuffle the products array
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Controller function to get products by Category ID with pagination
exports.getProductsByCategoryId = async (req, res) => {
  try {
    const categoryId = req.params.id; // Assuming 'id' is the category ID
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userLocation = req.query.userLocation;

    console.log("userLocation", userLocation);

    // Define the match criteria for products
    const matchCriteria = {
      category: new mongoose.Types.ObjectId(categoryId),
      availableLocalities: { $in: [userLocation, "all"] },
      quantity: { $gt: 0 }, // Ensure quantity is greater than 0
      isVisible: true,
    };

    // Perform the aggregation query
    const products = await Product.aggregate([
      { $match: matchCriteria },
      { $skip: (page - 1) * limit }, // Skip documents for pagination
      { $limit: limit }, // Limit the number of documents returned
    ]);

    shuffle(products);

    // Count the total number of products in the category with the specified location filter
    const totalProducts = await Product.countDocuments(matchCriteria);

    console.log("totalProducts page", products.length, page);

    // Send the products in the response with pagination metadata
    res.status(200).json({
      total: totalProducts,
      page,
      limit,
      products,
    });
  } catch (error) {
    console.error("Error retrieving products:", error);
    res.status(500).json({
      message: "Failed to retrieve products",
      error: error.message,
    });
  }
};
// Get similar products based on the same category
exports.getSimilarProducts = async (req, res) => {
  try {
    console.log("api call");
    const productId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const userLocation = req.query.userLocation;

    // Find the product by ID
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Find other products in the same category, excluding the current product
    const similarProducts = await Product.find({
      category: product.category,
      availableLocalities: { $in: [userLocation, "all"] },
      quantity: { $gt: 0 },
      isVisible: true,
      _id: { $ne: productId },
    })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalSimilarProducts = await Product.countDocuments({
      category: product.category,
      availableLocalities: { $in: [userLocation, "all"] },
      quantity: { $gt: 0 },
      _id: { $ne: productId },
    });

    res.json({
      total: totalSimilarProducts,
      page,
      limit,
      products: similarProducts,
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
    const locationFilter = userLocation
      ? {
          availableLocalities: { $in: [userLocation, "all"] },
          quantity: { $gt: 0 },
          isVisible: true,
        }
      : { quantity: { $gt: 0 }, isVisible: true };

    // Find the most recently added products with the location filter
    const recentlyAddedProducts = await Product.find(locationFilter)
      .sort({ createdAt: -1 }) // Sort by creation date in descending order
      .skip((page - 1) * limit)
      .limit(limit);

    // Count the total number of products with the location filter
    const totalRecentlyAddedProducts = await Product.countDocuments(
      locationFilter
    );

    res.json({
      total: totalRecentlyAddedProducts,
      page,
      limit,
      products: recentlyAddedProducts,
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
    const locationFilter = userLocation
      ? {
          availableLocalities: { $in: [userLocation, "all"] },
          quantity: { $gt: 0 },
          isVisible: true,
        }
      : { quantity: { $gt: 0 }, isVisible: true };

    // Combine the discount filter with the location filter
    const query = {
      discount: { $gt: 0 },
      ...locationFilter,
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
      products: discountedProducts,
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
    const regexQuery = new RegExp(searchQuery, "i"); // 'i' for case-insensitive

    // Construct the filter for availableLocalities
    const locationFilter = userLocation
      ? {
          availableLocalities: { $in: [userLocation, "all"] },
          quantity: { $gt: 0 },
          isVisible: true,
        }
      : { quantity: { $gt: 0 }, isVisible: true };

    // Combine the search query with the location filter
    const query = {
      ...locationFilter,
      $or: [
        { name: { $regex: regexQuery } },
        { description: { $regex: regexQuery } },
        { tags: { $regex: regexQuery } }, // Include tags in the search
      ],
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
      products: results,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateArrivalDuration = async (req, res) => {
  try {
    // Fetch all products that do not have the arrivalDuration field set
    const products = await Product.find({
      $or: [{ arrivalDuration: { $exists: false } }, { arrivalDuration: null }],
    });

    // Update each product based on the custom pre-validate logic
    const updatePromises = products.map(async (product) => {
      const containsNumber = product.availableLocalities.some((loc) =>
        /\d/.test(loc)
      );
      const containsAll = product.availableLocalities.includes("all");

      if (containsAll && !containsNumber) {
        product.arrivalDuration = "4 Days";
      } else if (containsNumber) {
        product.arrivalDuration = "90 Min";
      }

      return product.save();
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    res.status(200).json({
      message: "Arrival duration updated for all applicable products.",
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while updating arrival duration." });
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
        message: "Product not found",
      });
    }

    // Find the variation by ID within the product's variations array
    const variation = product.variations.id(variationId);

    if (!variation) {
      return res.status(404).json({
        message: "Variation not found",
      });
    }

    // Find the parent variation if exists
    const parentVariation = variation.parentVariation
      ? product.variations.id(variation.parentVariation)
      : null;

    // If the variation has a parent, check if the total quantity of all child variations exceeds the parent's quantity
    if (parentVariation) {
      // Update the quantity of the found variation
      variation.quantity = quantity;

      // Find all child variations of the parent variation
      const childVariations = product.variations.filter(
        (v) =>
          v.parentVariation && v.parentVariation.equals(parentVariation._id)
      );

      // Calculate the total quantity of all child variations including the current variation
      const totalChildQuantity = childVariations.reduce(
        (sum, v) => sum + v.quantity,
        0
      );

      if (totalChildQuantity > parentVariation.quantity) {
        return res.status(400).json({
          message:
            "Total quantity of child variations cannot exceed parent variation quantity",
        });
      }
    } else {
      // Update the quantity of the variation if it's a parent variation
      variation.quantity = quantity;
    }

    // Recalculate the root level quantity field
    const totalQuantity = product.variations.reduce(
      (sum, v) => (v.parentVariation === null ? sum + v.quantity : sum),
      0
    );

    product.quantity = totalQuantity;

    // Save the updated product to the database
    const updatedProduct = await product.save();

    // Send response
    res.status(200).json({
      message: "Variation quantity updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to update variation quantity",
      error: error.message,
    });
  }
};

exports.toggleVisibility = async (req, res) => {
  try {
    const productId = req.params.id; // Get the product ID from the request parameters

    // Find the product by its ID
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Toggle the 'isVisible' field
    product.isVisible = !product.isVisible;

    // Save the updated product
    await product.save();

    res.status(200).json({
      message: "Product visibility toggled successfully",
      product,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.addIsVisibleField = async (req, res) => {
  console.log("addIsVisibleField--->>>");
  try {
    // Update all products to add the 'isVisible' field with a default value (e.g., true)
    const result = await Product.updateMany(
      { isVisible: { $exists: false } }, // Only update documents that don't have 'isVisible'
      { $set: { isVisible: true } } // Set 'isVisible' to true
    );

    res.status(200).json({
      message: "Successfully added the `isVisible` field to all products.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const userLocation = req.query.userLocation;

    // Construct the filter for availableLocalities
    const locationFilter = userLocation
      ? {
          availableLocalities: { $in: [userLocation, "all"] },
          quantity: { $gt: 0 },
          isVisible: true,
        }
      : { quantity: { $gt: 0 }, isVisible: true };

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
      products,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getallCategoryProducts = async (req, res) => {
  try {
    // Fetch all categories
    const categories = await Category.find();

    const userLocation = req.query.userLocation;

    // Prepare the result array
    const result = await Promise.all(
      categories.map(async (category) => {
        // Fetch a maximum of 4 products for each category
        const products = await Product.find({
          availableLocalities: { $in: [userLocation, "all"] },
          category: category._id,
          isVisible: true,
        }).limit(4);

        // Return an object containing the category ID, name, and its products
        return {
          categoryId: category._id,
          categoryName: category.name,
          products: products,
        };
      })
    );

    // Send the result as the response
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching category products:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch category products", error });
  }
};

exports.makeActive = async (req, res) => {
  try {
    // Expecting the number of products to activate per category in the request body.
    const count = parseInt(req.body.count, 10);
    console.log("count==>>", count);
    if (!count || count <= 0) {
      return res.status(400).json({
        message:
          "Please provide a valid positive number for products to activate per category.",
      });
    }

    // Get all distinct categories from the Product collection.
    const categories = await Product.distinct("category");

    let totalUpdated = 0;

    // For each category, update up to `count` products to active (isVisible: true).
    for (const category of categories) {
      // Find up to `count` products in this category that are not active.
      const productsToUpdate = await Product.find({
        category,
        isVisible: false,
      })
        .limit(count)
        .select("_id");

      if (productsToUpdate.length > 0) {
        const productIds = productsToUpdate.map((prod) => prod._id);
        const result = await Product.updateMany(
          { _id: { $in: productIds } },
          { isVisible: true }
        );
        // Depending on your mongoose version, the number of modified docs may be in modifiedCount or nModified.
        totalUpdated += result.modifiedCount || result.nModified || 0;
      }
    }

    res.status(200).json({
      message: `Activated ${totalUpdated} products across ${categories.length} categories.`,
    });
  } catch (error) {
    console.error("Error making products active:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

exports.makeInActive = async (req, res) => {
  try {
    await Product.updateMany({}, { isVisible: false });
    res.status(200).json({ message: "All products are now inactive." });
  } catch (error) {
    console.error("Error making products inactive:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

//Dukaan Details Page → Search Products

// GET /products/search?vendorId=...&q=...
exports.searchVendorProducts = async (req, res) => {
  try {
    const { vendorId, q } = req.query;
    const products = await Product.find({
      vendor: vendorId,
      name: new RegExp(q, "i"),
    });

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: "Error searching vendor products", error });
  }
};

// Controller function to get products by Vendor ID for public consumption
exports.getProductsByVendor = async (req, res) => {
  console.log("it is called!!");
  try {
    // Chain .populate() to the find query to include variation details
    const products = await Product.find({
      vendor: req.params.vendorId,
    }).populate("variations");
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
