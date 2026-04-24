const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const dir = 'uploads/avatars';
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
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, GIF) are allowed'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

function createProfileRoutes(userModel, io) {
    const router = express.Router();

    // GET /api/profile/:userId - Get user profile (authenticated only)
    router.get('/:userId', authenticateToken, async (req, res) => {
        try {
            const profile = await userModel.getProfile(req.params.userId);

            if (!profile) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json(profile);
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({ error: 'Failed to get profile' });
        }
    });

    // PUT /api/profile - Update own profile
    router.put('/', authenticateToken, async (req, res) => {
        try {
            const { bio } = req.body;

            const updates = {};
            if (bio !== undefined) updates.bio = bio;

            const updatedProfile = await userModel.updateProfile(req.userId, updates);

            io.emit('user_updated', {
                id: req.userId,
                ...updatedProfile
            });

            res.json({
                message: 'Profile updated successfully',
                profile: updatedProfile
            });
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({ error: error.message || 'Failed to update profile' });
        }
    });

    // POST /api/profile/avatar - Upload avatar
    router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const originalPath = req.file.path;
            const optimizedFilename = `optimized-${req.file.filename}`;
            const optimizedPath = path.join('uploads/avatars', optimizedFilename);

            // Resize and optimize image to 400x400px
            await sharp(originalPath)
                .resize(400, 400, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 85 })
                .toFile(optimizedPath);

            // Delete original file
            await fs.unlink(originalPath);

            const avatarUrl = `/uploads/avatars/${optimizedFilename}`;

            // Update user avatar in database
            const updatedUser = await userModel.updateAvatar(req.userId, avatarUrl);

            io.emit('user_updated', {
                id: req.userId,
                avatar_url: avatarUrl
            });

            res.json({
                message: 'Avatar uploaded successfully',
                avatar_url: avatarUrl
            });
        } catch (error) {
            console.error('Avatar upload error:', error);
            // Clean up uploaded file if exists
            if (req.file) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    console.error('Failed to delete file:', unlinkError);
                }
            }
            res.status(500).json({ error: 'Failed to upload avatar' });
        }
    });

    // DELETE /api/profile/avatar - Remove avatar
    router.delete('/avatar', authenticateToken, async (req, res) => {
        try {
            await userModel.updateAvatar(req.userId, null);

            io.emit('user_updated', {
                id: req.userId,
                avatar_url: null
            });

            res.json({
                message: 'Avatar removed successfully'
            });
        } catch (error) {
            console.error('Remove avatar error:', error);
            res.status(500).json({ error: 'Failed to remove avatar' });
        }
    });

    return router;
}

module.exports = createProfileRoutes;
