const createS3Upload = require("./s3UploadMiddleware");

const handleS3Upload = (folderName, config) => {
  return createS3Upload(folderName, config);
};

module.exports = handleS3Upload;
