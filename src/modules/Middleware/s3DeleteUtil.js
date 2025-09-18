const { S3Client, DeleteObjectsCommand } = require("@aws-sdk/client-s3");

// Configure your S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Extracts the S3 object key from a full S3 URL.
 * @param {string} url - The full URL of the S3 object.
 * @returns {string|null} The S3 object key or null if not found.
 */
const extractS3KeyFromUrl = (url) => {
  if (typeof url !== "string") return null;
  try {
    const { pathname } = new URL(url);
    // The pathname will start with a '/', so we remove it.
    return pathname.substring(1);
  } catch (error) {
    console.error("Invalid URL for S3 key extraction:", url, error);
    return null;
  }
};

/**
 * Deletes multiple objects from an S3 bucket.
 * @param {string[]} keys - An array of S3 object keys to delete.
 */
const deleteS3Objects = async (keys) => {
  if (!keys || keys.length === 0) {
    return;
  }

  const deleteParams = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
      Quiet: false,
    },
  };

  try {
    const command = new DeleteObjectsCommand(deleteParams);
    const response = await s3Client.send(command);
    console.log("Successfully deleted objects from S3:", response.Deleted);
    if (response.Errors) {
      console.error("Errors encountered during S3 deletion:", response.Errors);
    }
  } catch (error) {
    console.error("Failed to delete objects from S3:", error);
    throw error;
  }
};

module.exports = {
  extractS3KeyFromUrl,
  deleteS3Objects,
};
