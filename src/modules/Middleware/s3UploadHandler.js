// src/modules/Middleware/s3UploadHandler.js
const createS3Upload = require("./s3UploadMiddleware");

const handleS3Upload = (folderName) => (req, res, next) => {
  const s3UploadMiddleware = createS3Upload(folderName);

  s3UploadMiddleware(req, res, (err) => {
    if (err) {
      console.error("S3 Upload Error:", err);
      return res.status(400).json({
        error: err.message,
        message: "File upload failed",
      });
    }
    next();
  });
};

module.exports = handleS3Upload;
