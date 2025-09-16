// src/modules/Middleware/s3UploadMiddleware.js (AWS SDK v3)
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

// Function to create S3 upload middleware with dynamic folder
const createS3Upload = (folderName) => {
  return multer({
    storage: multerS3({
      s3: s3Client,
      bucket: process.env.AWS_S3_BUCKET_NAME,
      key: function (req, file, cb) {
        // Create unique filename with timestamp
        const uniqueName = `${folderName}/${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
      },
      contentType: multerS3.AUTO_CONTENT_TYPE,
    }),
    fileFilter: function (req, file, cb) {
      // Optional: Add file type validation
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed!"), false);
      }
    },
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
  }).any(); // Accept any number of files with any field names
};

module.exports = createS3Upload;
