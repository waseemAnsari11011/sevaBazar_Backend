const Product = require("./model"); // Adjust the path as necessary
const mongoose = require("mongoose");
const Category = require("../Category/model");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");

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

// src/modules/Product/controller.js
// Controller function to add a new product
exports.addProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      vendor,
      availableLocalities,
      tags,
      isReturnAllowed,
    } = req.body;

    // ✅ FIX: Convert req.files object to a flat array before filtering
    const allUploadedFiles = req.files ? Object.values(req.files).flat() : [];

    // Extract S3 URLs from uploaded files
    const images = allUploadedFiles
      .filter((file) => file.fieldname.startsWith("productImage"))
      .map((file) => file.location); // S3 URL is stored in file.location

    const variationImages = allUploadedFiles.filter((file) =>
      file.fieldname.startsWith("variationImage")
    );

    const variations = JSON.parse(req.body.variations);

    if (!variations || variations.length === 0) {
      return res.status(400).json({
        message: "At least one variation is required",
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
      isReturnAllowed,
    });

    const variationReferences = {};
    const childQuantities = {};

    // Process and format variations
    const formattedVariations = variations.map((variation, index) => {
      const formattedVariation = {
        attributes: variation.attributes,
        price: variation.price ? parseInt(variation.price) : 0,
        discount: variation.discount ? parseInt(variation.discount) : 0,
        quantity: variation.quantity ? parseInt(variation.quantity) : 0,
        images: variationImages
          .filter((file) => file.fieldname.includes(`variationImage_${index}`))
          .map((file) => file.location), // S3 URL is stored in file.location
        parentVariation: null,
      };

      if (
        variation.parentVariation !== null &&
        variation.parentVariation !== ""
      ) {
        const parentIndex = variation.parentVariation.match(/\d+/)[0];
        if (variationReferences[parentIndex]) {
          formattedVariation.parentVariation =
            variationReferences[parentIndex]._id;
          if (!childQuantities[parentIndex]) {
            childQuantities[parentIndex] = 0;
          }
          childQuantities[parentIndex] += formattedVariation.quantity;
        } else {
          // This logic might need adjustment if parent variation isn't found
          console.warn(
            `Parent variation not found for: ${variation.parentVariation}`
          );
        }
      }

      const createdVariation = newProduct.variations.create(formattedVariation);
      variationReferences[index + 1] = createdVariation;

      return createdVariation;
    });

    // Validate child quantities against parent quantities
    for (const parentIndex in childQuantities) {
      if (
        childQuantities[parentIndex] > variationReferences[parentIndex].quantity
      ) {
        return res.status(400).json({
          message: `Sum of child quantities exceeds parent quantity for parent variation: ${parentIndex}`,
        });
      }
    }

    newProduct.variations = formattedVariations;
    newProduct.price = formattedVariations[0].price;
    newProduct.discount = formattedVariations[0].discount;
    newProduct.quantity = variations.reduce(
      (sum, variation) => sum + (parseInt(variation.quantity, 10) || 0),
      0
    );

    const savedProduct = await newProduct.save();

    res.status(201).json({
      message: "Product created successfully",
      product: savedProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to create product",
      error: error.message,
    });
  }
};

// ... (rest of your controller file)

// Controller function to update an existing product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // --- 1. Process Request Body ---
    const { name, description, category, vendor, isReturnAllowed } = req.body;

    // Sanitize array fields from FormData
    const availableLocalities = Array.isArray(req.body.availableLocalities)
      ? req.body.availableLocalities
      : req.body.availableLocalities
      ? [req.body.availableLocalities]
      : [];

    const tags = Array.isArray(req.body.tags)
      ? req.body.tags
      : req.body.tags
      ? [req.body.tags]
      : [];

    const existingImages = Array.isArray(req.body.existingImages)
      ? req.body.existingImages
      : req.body.existingImages
      ? [req.body.existingImages]
      : [];

    const parsedVariations = JSON.parse(req.body.variations || "[]");

    // --- 2. Process File Uploads ---
    // ✅ FIX: Convert req.files object to a flat array to handle uploads correctly
    const allUploadedFiles = req.files ? Object.values(req.files).flat() : [];

    const newProductImages = allUploadedFiles
      .filter((file) => file.fieldname.startsWith("productImage"))
      .map((file) => file.location);

    const newVariationImagesMap = new Map();
    allUploadedFiles
      .filter((file) => file.fieldname.startsWith("variationImage"))
      .forEach((file) => {
        const parts = file.fieldname.split("_");
        const variationIndex = parseInt(parts[1], 10);
        if (!newVariationImagesMap.has(variationIndex)) {
          newVariationImagesMap.set(variationIndex, []);
        }
        newVariationImagesMap.get(variationIndex).push(file.location);
      });

    // --- 3. Manage S3 Image Deletion ---
    const oldImageUrls = [
      ...product.images,
      ...product.variations.flatMap((v) => v.images),
    ];

    const keptImageUrls = new Set([
      ...existingImages,
      ...parsedVariations.flatMap((v) =>
        v.images.filter((img) => typeof img === "string")
      ),
    ]);

    const imagesToDelete = oldImageUrls.filter(
      (url) => !keptImageUrls.has(url)
    );

    // Asynchronously delete images from S3
    for (const imageUrl of imagesToDelete) {
      const s3Key = extractS3KeyFromUrl(imageUrl);
      if (s3Key) {
        await deleteS3Object(s3Key);
      }
    }

    // --- 4. Format Variations and Merge Images ---
    const formattedVariations = parsedVariations.map((variation, index) => {
      // Combine existing string URLs with new S3 URLs for this variation
      const existingVarImages = variation.images.filter(
        (img) => typeof img === "string"
      );
      const newVarImages = newVariationImagesMap.get(index) || [];

      return {
        ...variation,
        _id: variation._id || new mongoose.Types.ObjectId(), // Ensure new variations get an ID
        images: [...existingVarImages, ...newVarImages],
        price: parseInt(variation.price, 10) || 0,
        discount: parseInt(variation.discount, 10) || 0,
        quantity: parseInt(variation.quantity, 10) || 0,
      };
    });

    // --- 5. Update Product Document ---
    product.name = name;
    product.description = description;
    product.category = category;
    product.vendor = vendor;
    product.isReturnAllowed = isReturnAllowed;
    product.availableLocalities = availableLocalities;
    product.tags = tags;

    // Combine existing product images with new ones
    product.images = [...existingImages, ...newProductImages];
    product.variations = formattedVariations;

    // Recalculate main price/quantity from the first variation
    if (formattedVariations.length > 0) {
      product.price = formattedVariations[0].price;
      product.discount = formattedVariations[0].discount;
      product.quantity = formattedVariations.reduce(
        (sum, v) => sum + v.quantity,
        0
      );
    }

    const updatedProduct = await product.save();

    res.status(200).json({
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Failed to update product:", error);
    res.status(500).json({
      message: "Failed to update product",
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

    // Delete product images from S3
    for (const imagePath of product.images) {
      const s3Key = extractS3KeyFromUrl(imagePath);
      if (s3Key) {
        await deleteS3Object(s3Key);
      }
    }

    // Delete variation images from S3
    for (const variation of product.variations) {
      if (variation.images && variation.images.length > 0) {
        for (const imagePath of variation.images) {
          const s3Key = extractS3KeyFromUrl(imagePath);
          if (s3Key) {
            await deleteS3Object(s3Key);
          }
        }
      }
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
    const vendorId = req.params.vendorId;

    // Find all products, populate the category field, and sort by creation date (latest to oldest)
    const products = await Product.find({ vendor: vendorId })
      .populate("category")
      .sort({ createdAt: -1 });

    // Send response with the products
    res.status(200).json({
      message: "Products retrieved successfully",
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
  // console.log("getProductById->>", req.params.id)

  try {
    const { id } = req.params;

    // Find the product by ID and populate the category field
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    // Send the product in the response
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
    const products = await Product.find({ vendor: req.params.vendorId });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
