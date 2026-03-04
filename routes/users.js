const express = require('express');
const { authenticateToken } = require('../middleware/auth');

function createUserRoutes(userModel) {
    const router = express.Router();

    // Get all users (excluding current user)
    router.get('/', authenticateToken, async (req, res) => {
        try {
            const users = await userModel.getAllUsers(req.user.id);
            res.json({ users });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Get user by ID
    router.get('/:id', authenticateToken, async (req, res) => {
        try {
            const user = await userModel.findUserById(req.params.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json({ user });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    return router;
}

module.exports = createUserRoutes;
