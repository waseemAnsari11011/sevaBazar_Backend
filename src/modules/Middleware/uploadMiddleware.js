const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Function to create multer storage with dynamic directory
const getStorage = (uploadDir) => {
    // Create the uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    return multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir); // Use the dynamic directory
        },
        filename: (req, file, cb) => {
            cb(null, `${Date.now()}_${file.originalname}`);
        }
    });
};

// Middleware factory to handle both single and multiple file uploads
const upload = (uploadDir) => multer({ storage: getStorage(uploadDir) }).any(); // Accepts any type of file or files

module.exports = upload;
