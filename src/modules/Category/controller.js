const Category = require("./model"); // Adjust the path as necessary
const fs = require("fs");
const path = require("path");
const { deleteS3Objects } = require("../Middleware/s3DeleteUtil");

// Controller function to add a new category
exports.addCategory = async (req, res) => {
  try {
    const { name } = req.body;

    // Get S3 URLs from uploaded files
    const images = req.files ? req.files.map((file) => file.location) : [];

    // Create a new category instance
    const newCategory = new Category({
      name,
      images,
    });

    // Save the category to the database
    const savedCategory = await newCategory.save();

    // Send response
    res.status(201).json({
      message: "Category created successfully",
      category: savedCategory,
    });
  } catch (error) {
    console.error("Add Category Error:", error);
    res.status(500).json({
      message: "Failed to create category",
      error: error.message,
    });
  }
};

// Controller function to update an existing category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, existingImages } = req.body;

    // Find the category by ID
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    // Parse existingImages if it's a string (from form data)
    let parsedExistingImages = [];
    if (existingImages) {
      try {
        parsedExistingImages =
          typeof existingImages === "string"
            ? JSON.parse(existingImages)
            : existingImages;
      } catch (parseError) {
        console.error("Error parsing existingImages:", parseError);
        return res.status(400).json({
          message: "Invalid existingImages format",
          error: parseError.message,
        });
      }
    }

    // Find images to delete from S3 (images that are not in existingImages)
    const imagesToDelete = category.images.filter(
      (imagePath) => !parsedExistingImages.includes(imagePath)
    );

    // Delete removed images from S3
    if (imagesToDelete.length > 0) {
      try {
        await deleteS3Objects(imagesToDelete);
        console.log("Successfully deleted images from S3:", imagesToDelete);
      } catch (deleteError) {
        console.error("Failed to delete some images from S3:", deleteError);
        // Continue with the update even if S3 deletion fails
        // You might want to log this for manual cleanup later
      }
    }

    // Update the category details
    category.name = name || category.name;

    // Get new uploaded images (S3 URLs)
    const newImages = req.files ? req.files.map((file) => file.location) : [];

    // Combine existing images and new uploaded images
    category.images = parsedExistingImages.concat(newImages);

    // Save the updated category to the database
    const updatedCategory = await category.save();

    // Send response
    res.status(200).json({
      message: "Category updated successfully",
      category: updatedCategory,
    });
  } catch (error) {
    console.error("Update Category Error:", error);
    res.status(500).json({
      message: "Failed to update category",
      error: error.message,
    });
  }
};

// Controller function to get all categories
exports.getAllCategory = async (req, res) => {
  try {
    // Fetch all categories from the database
    const categories = await Category.find();

    // Send the categories in the response
    res.status(200).json({
      message: "Categories retrieved successfully",
      categories,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve categories",
      error: error.message,
    });
  }
};

// Controller function to get a category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the category by ID
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    // Send the category in the response
    res.status(200).json({
      message: "Category retrieved successfully",
      category,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve category",
      error: error.message,
    });
  }
};

// Controller function to delete a category by ID
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete the category by ID
    const deletedCategory = await Category.findByIdAndDelete(id);

    if (!deletedCategory) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    // Delete category images from the file system
    deletedCategory.images.forEach((imagePath) => {
      const fullPath = path.join(imagePath); // Adjust the path accordingly
      fs.unlink(fullPath, (err) => {
        if (err) {
          console.error(`Failed to delete image file: ${fullPath}`, err);
        }
      });
    });

    // Send response confirming deletion
    res.status(200).json({
      message: "Category deleted successfully",
      category: deletedCategory,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to delete category",
      error: error.message,
    });
  }
};
