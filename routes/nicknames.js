const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getNicknames, getAllNicknamesForUser } = require('../models/ConversationNickname');

function createNicknameRoutes() {
    const router = express.Router();

    // GET /api/nicknames - get all nicknames for the current user (for left panel display)
    router.get('/', authenticateToken, async (req, res) => {
        try {
            const nicknames = await getAllNicknamesForUser(req.userId);
            res.json({ nicknames });
        } catch (error) {
            console.error('Get all nicknames error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /api/nicknames/:partnerId - get nicknames for a 1:1 conversation
    router.get('/:partnerId', authenticateToken, async (req, res) => {
        try {
            const nicknames = await getNicknames(req.userId, req.params.partnerId);
            res.json({ nicknames });
        } catch (error) {
            console.error('Get nicknames error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    return router;
}

module.exports = createNicknameRoutes;
