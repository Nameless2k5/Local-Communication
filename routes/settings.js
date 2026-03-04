const express = require('express');
const { authenticateToken } = require('../middleware/auth');

function createSettingsRoutes(userModel) {
    const router = express.Router();

    // GET /api/settings - Get current user settings
    router.get('/', authenticateToken, async (req, res) => {
        try {
            const user = await userModel.findUserById(req.userId);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                email_notifications: user.email_notifications || {
                    enabled: true,
                    send_immediately: true
                }
            });
        } catch (error) {
            console.error('Get settings error:', error);
            res.status(500).json({ error: 'Failed to get settings' });
        }
    });

    // PUT /api/settings - Update settings
    router.put('/', authenticateToken, async (req, res) => {
        try {
            const { email_notifications } = req.body;

            if (!email_notifications) {
                return res.status(400).json({ error: 'email_notifications is required' });
            }

            const result = await userModel.updateSettings(req.userId, email_notifications);

            res.json({
                message: 'Settings updated successfully',
                settings: result
            });
        } catch (error) {
            console.error('Update settings error:', error);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    return router;
}

module.exports = createSettingsRoutes;
