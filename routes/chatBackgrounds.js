const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const dir = 'uploads/backgrounds';
        try {
            await fs.mkdir(dir, { recursive: true });
            cb(null, dir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG) are allowed'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

function createChatBackgroundRoutes(chatBackgroundModel, io, onlineUsers) {
    const router = express.Router();

    // GET /api/chat-backgrounds/:partnerId - Get background for conversation
    router.get('/:partnerId', authenticateToken, async (req, res) => {
        try {
            const background = await chatBackgroundModel.getBackground(
                req.userId,
                req.params.partnerId
            );

            if (!background) {
                return res.json({ background_url: null });
            }

            res.json(background);
        } catch (error) {
            console.error('Get chat background error:', error);
            res.status(500).json({ error: 'Failed to get chat background' });
        }
    });

    // POST /api/chat-backgrounds/:partnerId - Upload custom background
    router.post('/:partnerId', authenticateToken, upload.single('background'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const originalPath = req.file.path;
            const optimizedFilename = `optimized-${req.file.filename}`;
            const optimizedPath = path.join('uploads/backgrounds', optimizedFilename);

            // Optimize image (max 1920x1080, maintain aspect ratio)
            await sharp(originalPath)
                .resize(1920, 1080, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 80 })
                .toFile(optimizedPath);

            // Delete original file
            await fs.unlink(originalPath);

            const backgroundUrl = `/uploads/backgrounds/${optimizedFilename}`;

            // Save to database for CURRENT user
            const background = await chatBackgroundModel.setBackground(
                req.userId,
                req.params.partnerId,
                backgroundUrl
            );

            // Save to database for PARTNER user (so they see it too)
            await chatBackgroundModel.setBackground(
                req.params.partnerId,
                req.userId,
                backgroundUrl
            );

            // Emit update to partner if online
            if (io && onlineUsers) {
                const partnerSocketId = onlineUsers.get(req.params.partnerId);
                if (partnerSocketId) {
                    io.to(partnerSocketId).emit('chat_background_updated', {
                        partnerId: req.userId, // From partner's perspective, I am the partner
                        backgroundUrl: backgroundUrl
                    });
                }
            }

            res.json({
                message: 'Background uploaded successfully',
                background
            });
        } catch (error) {
            console.error('Upload background error:', error);
            // Clean up uploaded file if exists
            if (req.file) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    console.error('Failed to delete file:', unlinkError);
                }
            }
            res.status(500).json({ error: 'Failed to upload background' });
        }
    });

    // DELETE /api/chat-backgrounds/:partnerId - Reset to default
    router.delete('/:partnerId', authenticateToken, async (req, res) => {
        try {
            // Delete for CURRENT user
            const deleted = await chatBackgroundModel.deleteBackground(
                req.userId,
                req.params.partnerId
            );

            // Delete for PARTNER user
            await chatBackgroundModel.deleteBackground(
                req.params.partnerId,
                req.userId
            );

            // Emit update to partner if online
            if (io && onlineUsers) {
                const partnerSocketId = onlineUsers.get(req.params.partnerId);
                if (partnerSocketId) {
                    io.to(partnerSocketId).emit('chat_background_updated', {
                        partnerId: req.userId,
                        backgroundUrl: null
                    });
                }
            }

            if (deleted) {
                res.json({ message: 'Background reset to default' });
            } else {
                res.status(404).json({ error: 'Background not found' });
            }
        } catch (error) {
            console.error('Delete background error:', error);
            res.status(500).json({ error: 'Failed to delete background' });
        }
    });

    return router;
}

module.exports = createChatBackgroundRoutes;
