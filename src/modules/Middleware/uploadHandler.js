// utils/uploadHandler.js

const upload = require('./uploadMiddleware'); // Adjust the path as necessary

const handleUpload = (uploadDir) => (req, res, next) => {
    const uploadMiddleware = upload(uploadDir);
    uploadMiddleware(req, res, (err) => {
        if (err) {
            return res.status(400).send({ error: err.message });
        }
        next();
    });
};

module.exports = handleUpload;
