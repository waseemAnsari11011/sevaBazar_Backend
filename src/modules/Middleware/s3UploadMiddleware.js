const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");

// Configure AWS S3 Client (v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ✅ Function to create a flexible S3 upload middleware
const createS3Upload = (folderName, config) => {
  const multerConfig = {
    storage: multerS3({
      s3: s3Client,
      bucket: process.env.AWS_S3_BUCKET_NAME,
      key: (req, file, cb) => {
        const uniqueName = `${folderName}/${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
      },
      contentType: multerS3.AUTO_CONTENT_TYPE,
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed!"), false);
      }
    },
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  };

  // Check the type of configuration provided
  if (Array.isArray(config)) {
    // If it's an array, use .fields() - for your Products route
    return multer(multerConfig).fields(config);
  } else if (typeof config === "string") {
    // If it's a string, use .array() - for your Categories route
    return multer(multerConfig).array(config, 10); // Allows up to 10 images in the 'images' field
  } else {
    // Fallback for any other case
    return multer(multerConfig).any();
  }
};

module.exports = createS3Upload;
