const VendorProductCategory = require("./model");
const {
  deleteS3Objects,
  extractS3KeyFromUrl,
} = require("../Middleware/s3DeleteUtil");

// Add a new category
exports.addCategory = async (req, res) => {
  try {
    const { name, vendor } = req.body;
    const images = req.files ? req.files.map((file) => file.location) : [];

    const newCategory = new VendorProductCategory({
      name,
      vendor,
      images,
    });

    const savedCategory = await newCategory.save();
    res.status(201).json({
      message: "Vendor product category created successfully",
      category: savedCategory,
    });
  } catch (error) {
    console.error("Add Vendor Product Category Error:", error);
    res.status(500).json({
      message: "Failed to create vendor product category",
      error: error.message,
    });
  }
};

// Get all categories for a specific vendor
exports.getCategoriesByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const categories = await VendorProductCategory.find({ vendor: vendorId });
    res.status(200).json({
      message: "Vendor product categories retrieved successfully",
      categories,
    });
  } catch (error) {
    console.error("Get Vendor Product Categories Error:", error);
    res.status(500).json({
      message: "Failed to retrieve vendor product categories",
      error: error.message,
    });
  }
};

// Update a category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const category = await VendorProductCategory.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    let existingImages = req.body.existingImages || [];
    if (typeof existingImages === "string") {
      existingImages = [existingImages];
    }

    // Find images to delete from S3
    const imagesToDelete = category.images.filter(
      (imagePath) => !existingImages.includes(imagePath)
    );

    if (imagesToDelete.length > 0) {
      const s3KeysToDelete = imagesToDelete
        .map((url) => extractS3KeyFromUrl(url))
        .filter((key) => key);
      if (s3KeysToDelete.length > 0) {
        await deleteS3Objects(s3KeysToDelete);
      }
    }

    const newImages = req.files ? req.files.map((file) => file.location) : [];

    category.name = name || category.name;
    category.images = [...existingImages, ...newImages];

    const updatedCategory = await category.save();

    res.status(200).json({
      message: "Vendor product category updated successfully",
      category: updatedCategory,
    });
  } catch (error) {
    console.error("Update Vendor Product Category Error:", error);
    res.status(500).json({
      message: "Failed to update vendor product category",
      error: error.message,
    });
  }
};

// Delete a category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await VendorProductCategory.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Delete images from S3
    if (category.images && category.images.length > 0) {
      const s3KeysToDelete = category.images
        .map((url) => extractS3KeyFromUrl(url))
        .filter((key) => key);
      if (s3KeysToDelete.length > 0) {
        await deleteS3Objects(s3KeysToDelete);
      }
    }

    await VendorProductCategory.findByIdAndDelete(id);

    res.status(200).json({
      message: "Vendor product category deleted successfully",
    });
  } catch (error) {
    console.error("Delete Vendor Product Category Error:", error);
    res.status(500).json({
      message: "Failed to delete vendor product category",
      error: error.message,
    });
  }
};
