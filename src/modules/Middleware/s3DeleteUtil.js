// src/modules/utils/s3DeleteUtil.js (AWS SDK v3)
const {
  S3Client,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");

// Configure AWS S3 Client (v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Function to extract S3 key from URL
const extractS3Key = (s3Url) => {
  try {
    const url = new URL(s3Url);
    // Remove the leading slash and return the key
    return url.pathname.substring(1);
  } catch (error) {
    console.error("Invalid S3 URL:", s3Url);
    throw new Error("Invalid S3 URL format");
  }
};

// Function to delete a single file from S3
const deleteS3Object = async (fileUrl) => {
  try {
    const key = extractS3Key(fileUrl);

    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
    });

    const result = await s3Client.send(deleteCommand);
    console.log("File deleted successfully:", key);
    return result;
  } catch (error) {
    console.error("Error deleting file from S3:", error);
    throw error;
  }
};

// Function to delete multiple files from S3
const deleteS3Objects = async (fileUrls) => {
  try {
    if (!fileUrls || fileUrls.length === 0) {
      console.log("No files to delete");
      return;
    }

    const objects = fileUrls.map((url) => {
      const key = extractS3Key(url);
      return { Key: key };
    });

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Delete: {
        Objects: objects,
        Quiet: true,
      },
    });

    const result = await s3Client.send(deleteCommand);
    console.log("Files deleted successfully:", result);
    return result;
  } catch (error) {
    console.error("Error deleting files from S3:", error);
    throw error;
  }
};

module.exports = {
  deleteS3Object,
  deleteS3Objects,
};
