const Banner = require("./model"); // Adjust the path as necessary
const fs = require("fs");
const path = require("path");
const {
  extractS3KeyFromUrl,
  deleteS3Objects,
} = require("../Middleware/s3DeleteUtil");
// Controller function to add a new banner
exports.addBanner = async (req, res) => {
  try {
    const { name } = req.body;

    // --- CHANGED ---
    // Get S3 locations from req.files instead of local paths
    const images = req.files.map((file) => file.location);
    // --- END CHANGE ---

    // Create a new banner instance
    const newBanner = new Banner({
      name,
      images,
    });

    // Save the banner to the database
    const savedBanner = await newBanner.save();

    // Send response
    res.status(201).json({
      message: "Banner created successfully",
      banner: savedBanner,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to create banner",
      error: error.message,
    });
  }
};

// Controller function to update an existing banner
exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // --- CHANGED ---
    // This logic robustly handles all cases:
    // 1. req.body.existingImages is undefined -> imagesToKeep = []
    // 2. req.body.existingImages is a single string -> imagesToKeep = [string]
    // 3. req.body.existingImages is an array -> imagesToKeep = [array]
    let imagesToKeep = [];
    if (req.body.existingImages) {
      if (Array.isArray(req.body.existingImages)) {
        imagesToKeep = req.body.existingImages;
      } else {
        // It's a single string, wrap it in an array
        imagesToKeep = [req.body.existingImages];
      }
    }
    // --- END CHANGE ---

    // Find the banner by ID
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    // Find images to delete from S3
    const imagesToDelete = banner.images.filter(
      (imgUrl) => !imagesToKeep.includes(imgUrl)
    );

    // Extract S3 keys from the URLs
    const keysToDelete = imagesToDelete
      .map(extractS3KeyFromUrl)
      .filter(Boolean);

    // Asynchronously delete the objects from S3 if there are any
    if (keysToDelete.length > 0) {
      await deleteS3Objects(keysToDelete);
      console.log("Deleted S3 objects:", keysToDelete);
    }

    // Update the banner details
    banner.name = name || banner.name;

    // Combine existing images (now a guaranteed array) and new S3 image locations
    const newImages = req.files.map((file) => file.location);

    // This is now safe ARRAY concatenation
    banner.images = imagesToKeep.concat(newImages);

    // Save the updated banner to the database
    const updatedBanner = await banner.save();

    // Send response
    res.status(200).json({
      message: "Banner updated successfully",
      banner: updatedBanner,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to update banner",
      error: error.message,
    });
  }
};

exports.makeBannerActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "Invalid isActive value. It should be a boolean.",
      });
    }

    console.log("isActive--->>", isActive);

    // Find the banner by ID
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    // Update the banner details
    banner.isActive = isActive;

    console.log("banner-->>", banner);

    // Save the updated banner to the database
    const updatedBanner = await banner.save();

    // Send response
    res.status(200).json({
      message: "Banner status updated successfully",
      banner: updatedBanner,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to update banner status",
      error: error.message,
    });
  }
};

// Controller function to get all banners
exports.getAllBanner = async (req, res) => {
  try {
    // Fetch all banners from the database
    const banners = await Banner.find();

    // Send the banners in the response
    res.status(200).json({
      message: "Banners retrieved successfully",
      banners,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve banners",
      error: error.message,
    });
  }
};

// Controller function to get all active banners
exports.getAllActiveBanner = async (req, res) => {
  try {
    // Fetch all active banners from the database
    const banners = await Banner.find({ isActive: true });

    // Send the banners in the response
    res.status(200).json({
      message: "Active banners retrieved successfully",
      banners,
    });
  } catch (error) {
    console.error("Error fetching active banners:", error);
    res.status(500).json({
      message: "Failed to retrieve active banners",
      error: error.message,
    });
  }
};

// Controller function to get a banner by ID
exports.getBannerById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the banner by ID
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    // Send the banner in the response
    res.status(200).json({
      message: "Banner retrieved successfully",
      banner,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to retrieve banner",
      error: error.message,
    });
  }
};

// Controller function to delete a banner by ID
exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete the banner by ID
    const deletedBanner = await Banner.findByIdAndDelete(id);

    if (!deletedBanner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    // Delete banner images from the file system
    deletedBanner.images.forEach((imagePath) => {
      const fullPath = path.join(imagePath); // Adjust the path accordingly
      fs.unlink(fullPath, (err) => {
        if (err) {
          console.error(`Failed to delete image file: ${fullPath}`, err);
        }
      });
    });

    // Send response confirming deletion
    res.status(200).json({
      message: "Banner deleted successfully",
      banner: deletedBanner,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to delete banner",
      error: error.message,
    });
  }
};
