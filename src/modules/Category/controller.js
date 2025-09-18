const Category = require("./model");
const {
  deleteS3Objects,
  extractS3KeyFromUrl,
} = require("../Middleware/s3DeleteUtil"); // Assuming s3DeleteUtil exists

exports.addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    // Get S3 URLs from uploaded files. Multer populates req.files as an array.
    const images = req.files ? req.files.map((file) => file.location) : [];
    const newCategory = new Category({ name, images });
    const savedCategory = await newCategory.save();
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

// ✅ CORRECTED UPDATE LOGIC
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Directly use req.body.existingImages, ensuring it's an array.
    let existingImages = req.body.existingImages || [];
    if (typeof existingImages === "string") {
      existingImages = [existingImages];
    }

    // Find images to delete from S3
    const imagesToDelete = category.images.filter(
      (imagePath) => !existingImages.includes(imagePath)
    );

    // Delete removed images from S3
    if (imagesToDelete.length > 0) {
      // Extract keys from full URLs before deleting
      const s3KeysToDelete = imagesToDelete
        .map((url) => extractS3KeyFromUrl(url))
        .filter((key) => key);
      if (s3KeysToDelete.length > 0) {
        await deleteS3Objects(s3KeysToDelete);
      }
    }

    // Get new uploaded image URLs
    const newImages = req.files ? req.files.map((file) => file.location) : [];

    // Update category details
    category.name = name || category.name;
    category.images = [...existingImages, ...newImages]; // Combine kept images with new ones

    const updatedCategory = await category.save();

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
