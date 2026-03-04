const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// File size limits by type (in bytes)
const FILE_LIMITS = {
    image: 5 * 1024 * 1024,    // 5MB
    video: 50 * 1024 * 1024,   // 50MB
    file: 10 * 1024 * 1024     // 10MB
};

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// File filter validation
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        // Images
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        // Videos
        'video/mp4', 'video/webm', 'video/quicktime',
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        // Archives
        'application/zip', 'application/x-zip-compressed'
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, videos, PDFs, and documents are allowed.'));
    }
};

// Configure multer
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // Max 50MB (will check specific limits in route)
    }
});

// Detect file type category
function getFileCategory(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    return 'file';
}

// POST /api/upload - Upload file
router.post('/', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const uploadedFiles = [];

        for (const file of req.files) {
            const fileCategory = getFileCategory(file.mimetype);

            // Check file size limit for category
            if (file.size > FILE_LIMITS[fileCategory]) {
                // Delete uploaded file if it exceeds limit
                fs.unlinkSync(file.path);
                return res.status(400).json({
                    error: `File too large. Max size for ${fileCategory} is ${FILE_LIMITS[fileCategory] / 1024 / 1024}MB`
                });
            }

            // Use relative path for storage
            const fileUrl = `/uploads/${file.filename}`;
            let thumbnailUrl = null;

            // Generate thumbnail for images
            if (fileCategory === 'image') {
                try {
                    const thumbnailName = `thumb-${file.filename}`;
                    const thumbnailPath = path.join(uploadsDir, thumbnailName);

                    await sharp(file.path)
                        .resize(300, 300, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .toFile(thumbnailPath);

                    thumbnailUrl = `/uploads/${thumbnailName}`;
                } catch (thumbError) {
                    console.error('Thumbnail generation failed:', thumbError);
                    // Continue without thumbnail
                }
            }

            // Push to metadata array
            uploadedFiles.push({
                filename: file.originalname,
                stored_name: file.filename,
                file_path: `/uploads/${file.filename}`,
                file_url: fileUrl,
                mime_type: file.mimetype,
                file_size: file.size,
                thumbnail_url: thumbnailUrl
            });
        }

        // Return files metadata array
        res.json({ files: uploadedFiles });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

module.exports = router;
