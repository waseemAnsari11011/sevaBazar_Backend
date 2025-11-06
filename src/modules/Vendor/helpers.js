const { S3Client, DeleteObjectsCommand } = require("@aws-sdk/client-s3");

/**
 * Normalize req.files to always return a fileMap object
 * Handles both array format and object format from multer
 */
const normalizeFiles = (files) => {
  if (!files) return null;

  const fileMap = {};

  if (Array.isArray(files)) {
    // If array, group files by fieldname
    files.forEach((file) => {
      if (!fileMap[file.fieldname]) {
        fileMap[file.fieldname] = [];
      }
      fileMap[file.fieldname].push(file);
    });
  } else if (typeof files === "object") {
    // If object (from multer.fields()), it's already grouped by fieldname
    // Convert single files to arrays for consistent handling
    Object.keys(files).forEach((fieldname) => {
      fileMap[fieldname] = Array.isArray(files[fieldname])
        ? files[fieldname]
        : [files[fieldname]];
    });
  }

  return Object.keys(fileMap).length > 0 ? fileMap : null;
};

/**
 * Check if a specific file field was uploaded
 * Works with both array and object format
 */
const isFileUploaded = (files, fieldname) => {
  if (!files) return false;

  if (Array.isArray(files)) {
    return files.some((f) => f.fieldname === fieldname);
  } else if (typeof files === "object") {
    return !!files[fieldname];
  }

  return false;
};

/**
 * Extract S3 key from full S3 URL
 */
const extractS3KeyFromUrl = (url) => {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1);
  } catch (error) {
    console.error("Error extracting S3 key from URL:", url, error);
    return null;
  }
};

/**
 * Delete multiple objects from S3
 */
const deleteS3Objects = async (keys) => {
  if (!keys || keys.length === 0) return;

  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const deleteParams = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
      Quiet: false,
    },
  };

  const command = new DeleteObjectsCommand(deleteParams);
  return await s3Client.send(command);
};

module.exports = {
  normalizeFiles,
  isFileUploaded,
  extractS3KeyFromUrl,
  deleteS3Objects,
};
