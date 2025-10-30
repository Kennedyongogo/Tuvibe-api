const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine upload directory based on file type
    let uploadPath;

    if (
      file.fieldname === "project_image" ||
      file.fieldname === "project_images" ||
      file.fieldname === "update_images"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "projects");
    } else if (file.fieldname === "profile_image") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "profiles");
    } else if (
      file.fieldname === "document" ||
      file.fieldname === "documents" ||
      file.fieldname === "file"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "documents");
    } else if (file.fieldname === "inquiry_attachment") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "inquiries");
    } else {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "misc");
    }

    console.log("📁 Upload destination:", uploadPath);
    console.log("📁 Directory exists:", fs.existsSync(uploadPath));

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
      console.log("📁 Created directory:", uploadPath);
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    // Sanitize filename
    const sanitizedBasename = basename.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `${sanitizedBasename}-${uniqueSuffix}${extension}`;
    console.log("📄 Generated filename:", filename);
    cb(null, filename);
  },
});

// File filter to allow specific file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    // Images
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    // Documents
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "text/plain": ".txt",
    "text/csv": ".csv",
  };

  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Allowed types: ${Object.values(allowedTypes).join(", ")}`
      ),
      false
    );
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Middleware for single profile picture upload
const uploadProfileImage = upload.single("profile_image");

// Middleware for single document upload
const uploadDocument = upload.single("document");

// Middleware for file upload (generic)
const uploadFile = upload.single("file");

// Middleware for multiple documents upload
const uploadDocuments = upload.array("documents", 10); // Max 10 files

// Middleware for project images
const uploadProjectImage = upload.single("project_image");

// Middleware for multiple project images with text fields
const uploadProjectImages = upload.any();

// Middleware for inquiry attachments
const uploadInquiryAttachment = upload.single("inquiry_attachment");

// Middleware for mixed uploads (multiple fields)
const uploadMixed = upload.fields([
  { name: "profile_image", maxCount: 1 },
  { name: "document", maxCount: 1 },
  { name: "documents", maxCount: 10 },
]);

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 10MB.",
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum is 10 files.",
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field.",
      });
    }
  }

  if (error && error.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  next(error);
};

// Helper function to delete file
const deleteFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log("🗑️ Deleted file:", filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting file:", error);
    return false;
  }
};

// Helper function to get file type from mimetype
const getFileType = (mimetype) => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype === "application/pdf") return "pdf";
  if (
    mimetype === "application/msword" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "word";
  }
  if (
    mimetype === "application/vnd.ms-excel" ||
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "excel";
  }
  if (
    mimetype === "application/vnd.ms-powerpoint" ||
    mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "powerpoint";
  }
  if (mimetype === "text/plain" || mimetype === "text/csv") return "text";
  return "other";
};

module.exports = {
  uploadProfileImage,
  uploadDocument,
  uploadFile,
  uploadDocuments,
  uploadProjectImage,
  uploadProjectImages,
  uploadInquiryAttachment,
  uploadMixed,
  handleUploadError,
  deleteFile,
  getFileType,
};
