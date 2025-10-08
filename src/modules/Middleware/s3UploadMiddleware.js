const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
const sharp = require("sharp");

// Configure AWS S3 Client (v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const multerUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      // For non-image files, you might want to handle them differently
      // or reject them if you only want to allow images.
      // For now, we allow them to pass through without compression.
      cb(null, true);
    }
  },
});

const compressAndUpload = (folderName) => async (req, res, next) => {
  if (!req.files) {
    return next();
  }

  const files = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files).flat();

  if (!files || files.length === 0) {
    return next();
  }

  try {
    await Promise.all(
      files.map(async (file) => {
        const originalName = file.originalname;
        const uniqueName = `${folderName}/${Date.now()}_${originalName}`;
        let processedBuffer = file.buffer;

        // Compress images
        if (file.mimetype.startsWith("image/")) {
          let sharpInstance = sharp(file.buffer).resize(1920, 1080, {
            fit: "inside",
            withoutEnlargement: true,
          });

          if (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
            processedBuffer = await sharpInstance
              .jpeg({ quality: 80, progressive: true, optimizeScans: true })
              .toBuffer();
          } else if (file.mimetype === "image/png") {
            processedBuffer = await sharpInstance
              .png({ quality: 80, compressionLevel: 8 })
              .toBuffer();
          } else {
            // For other image types like webp, gif etc.
            processedBuffer = await sharpInstance
              .webp({ quality: 75 })
              .toBuffer();
          }

          // If still over 5MB, apply more aggressive compression
          if (processedBuffer.length > 5 * 1024 * 1024) {
            processedBuffer = await sharp(processedBuffer)
              .jpeg({ quality: 60 })
              .toBuffer();
          }
        }

        const uploadParams = {
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: uniqueName,
          Body: processedBuffer,
          ContentType: file.mimetype,
        };

        const command = new PutObjectCommand(uploadParams);
        await s3Client.send(command);

        file.location = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueName}`;
        delete file.buffer; // Free up memory
      })
    );
    next();
  } catch (error) {
    console.error("Error in compression/upload middleware:", error);
    next(error);
  }
};

const createS3Upload = (folderName, config) => {
  let uploadMiddleware;
  if (Array.isArray(config)) {
    uploadMiddleware = multerUpload.fields(config);
  } else if (typeof config === "string") {
    uploadMiddleware = multerUpload.array(config, 10);
  } else {
    uploadMiddleware = multerUpload.any();
  }

  return [uploadMiddleware, compressAndUpload(folderName)];
};

module.exports = createS3Upload;
