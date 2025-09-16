require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mongoose = require("mongoose");
const Product = require("./src/modules/Product/model"); // Adjust the path as necessary

// Configure AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(
      `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`
    );
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Function to upload file to S3
const uploadToS3 = async (filePath, fileName) => {
  try {
    // Read file from local storage
    const fileContent = fs.readFileSync(filePath);

    // Determine content type based on file extension
    const ext = path.extname(fileName).toLowerCase();
    let contentType = "application/octet-stream";

    switch (ext) {
      case ".jpg":
      case ".jpeg":
        contentType = "image/jpeg";
        break;
      case ".png":
        contentType = "image/png";
        break;
      case ".gif":
        contentType = "image/gif";
        break;
      case ".webp":
        contentType = "image/webp";
        break;
    }

    // S3 key (path in S3 bucket)
    const s3Key = `products/${Date.now()}_${fileName}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType,
      // Optional: Make files publicly readable
      // ACL: 'public-read'
    });

    const result = await s3Client.send(uploadCommand);

    // Return the S3 URL
    const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    console.log(`✅ Uploaded: ${fileName} -> ${s3Url}`);
    return s3Url;
  } catch (error) {
    console.error(`❌ Error uploading ${fileName}:`, error.message);
    return null;
  }
};

// Function to check if file exists locally
const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
};

// Function to migrate images for a single product
const migrateProductImages = async (product) => {
  try {
    console.log(
      `\n🔄 Processing product: ${product.name} (ID: ${product._id})`
    );

    let updatedImages = [];
    let updatedVariations = [...product.variations];
    let hasChanges = false;

    // Process main product images
    if (product.images && product.images.length > 0) {
      console.log(
        `📁 Processing ${product.images.length} main product images...`
      );

      for (const imagePath of product.images) {
        // Skip if already an S3 URL
        if (imagePath.startsWith("http")) {
          updatedImages.push(imagePath);
          continue;
        }

        const localFilePath = path.join(__dirname, "..", imagePath);
        const fileName = path.basename(imagePath);

        if (fileExists(localFilePath)) {
          const s3Url = await uploadToS3(localFilePath, fileName);
          if (s3Url) {
            updatedImages.push(s3Url);
            hasChanges = true;
          } else {
            console.log(
              `⚠️ Failed to upload ${fileName}, keeping original path`
            );
            updatedImages.push(imagePath);
          }
        } else {
          console.log(
            `⚠️ File not found: ${localFilePath}, keeping original path`
          );
          updatedImages.push(imagePath);
        }
      }
    }

    // Process variation images
    if (product.variations && product.variations.length > 0) {
      console.log(`🔄 Processing variations...`);

      for (let i = 0; i < updatedVariations.length; i++) {
        const variation = updatedVariations[i];

        if (variation.images && variation.images.length > 0) {
          console.log(
            `📁 Processing ${variation.images.length} images for variation ${
              i + 1
            }...`
          );

          let updatedVariationImages = [];

          for (const imagePath of variation.images) {
            // Skip if already an S3 URL
            if (imagePath.startsWith("http")) {
              updatedVariationImages.push(imagePath);
              continue;
            }

            const localFilePath = path.join(__dirname, "..", imagePath);
            const fileName = path.basename(imagePath);

            if (fileExists(localFilePath)) {
              const s3Url = await uploadToS3(localFilePath, fileName);
              if (s3Url) {
                updatedVariationImages.push(s3Url);
                hasChanges = true;
              } else {
                console.log(
                  `⚠️ Failed to upload ${fileName}, keeping original path`
                );
                updatedVariationImages.push(imagePath);
              }
            } else {
              console.log(
                `⚠️ File not found: ${localFilePath}, keeping original path`
              );
              updatedVariationImages.push(imagePath);
            }
          }

          updatedVariations[i].images = updatedVariationImages;
        }
      }
    }

    // Update the product in database if there are changes
    if (hasChanges) {
      await Product.findByIdAndUpdate(product._id, {
        images: updatedImages,
        variations: updatedVariations,
        updatedAt: new Date(),
      });
      console.log(`✅ Updated product in database: ${product.name}`);
      return true;
    } else {
      console.log(`ℹ️ No changes needed for product: ${product.name}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing product ${product._id}:`, error.message);
    return false;
  }
};

// Main migration function
const migrateAllProductImages = async () => {
  try {
    console.log("🚀 Starting product images migration to S3...\n");

    // Connect to MongoDB
    await connectDB();

    // Get all products
    const products = await Product.find({});
    console.log(`📊 Found ${products.length} products to process\n`);

    if (products.length === 0) {
      console.log("ℹ️ No products found in database");
      return;
    }

    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    // Process products in batches to avoid overwhelming the system
    const batchSize = 5;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      console.log(
        `\n📦 Processing batch ${Math.floor(i / batchSize) + 1} (products ${
          i + 1
        }-${Math.min(i + batchSize, products.length)})`
      );

      const batchPromises = batch.map(async (product) => {
        try {
          const wasUpdated = await migrateProductImages(product);
          processedCount++;
          if (wasUpdated) updatedCount++;
          return true;
        } catch (error) {
          console.error(
            `❌ Batch error for product ${product._id}:`,
            error.message
          );
          errorCount++;
          return false;
        }
      });

      await Promise.all(batchPromises);

      // Add a small delay between batches to be nice to S3
      if (i + batchSize < products.length) {
        console.log("⏳ Waiting 2 seconds before next batch...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log("\n🎉 Migration completed!");
    console.log(`📊 Summary:`);
    console.log(`   - Products processed: ${processedCount}`);
    console.log(`   - Products updated: ${updatedCount}`);
    console.log(`   - Errors: ${errorCount}`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed");
    process.exit(0);
  }
};

// Function to migrate specific products by IDs (useful for testing)
const migrateSpecificProducts = async (productIds) => {
  try {
    console.log("🚀 Starting migration for specific products...\n");

    await connectDB();

    const products = await Product.find({
      _id: { $in: productIds },
    });

    console.log(`📊 Found ${products.length} products to process\n`);

    for (const product of products) {
      await migrateProductImages(product);
    }

    console.log("\n✅ Specific products migration completed!");
  } catch (error) {
    console.error("❌ Specific products migration failed:", error);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed");
    process.exit(0);
  }
};

// Command line interface
const args = process.argv.slice(2);

if (args.length > 0 && args[0] === "--specific") {
  // Migrate specific products
  const productIds = args.slice(1);
  if (productIds.length === 0) {
    console.log("❌ Please provide product IDs when using --specific flag");
    console.log(
      "Usage: node migrate-images.js --specific 66741e93863a6e5ad597f32f 66741e93863a6e5ad597f330"
    );
    process.exit(1);
  }
  migrateSpecificProducts(productIds);
} else {
  // Migrate all products
  migrateAllProductImages();
}

module.exports = {
  migrateAllProductImages,
  migrateSpecificProducts,
  migrateProductImages,
};
