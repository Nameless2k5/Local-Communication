const express = require('express');
const { authenticateToken } = require('../middleware/auth');

function createMessageRoutes(messageModel) {
    const router = express.Router();

    // Get conversation with a specific user
    router.get('/:userId', authenticateToken, async (req, res) => {
        try {
            const messages = await messageModel.getConversation(req.user.id, req.params.userId);

            // Mark messages as read
            await messageModel.markAsRead(req.user.id, req.params.userId);

            res.json({ messages });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Get unread message count
    router.get('/unread/count', authenticateToken, async (req, res) => {
        try {
            const count = await messageModel.getUnreadCount(req.user.id);
            res.json({ count });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Get unread messages grouped by sender
    router.get('/unread/by-sender', authenticateToken, (req, res) => {
        try {
            const unreadBySender = messageModel.getUnreadBySender(req.user.id);
            res.json({ unreadBySender });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Toggle pin status
    router.put('/:messageId/pin', authenticateToken, async (req, res) => {
        try {
            const message = await messageModel.togglePin(req.params.messageId, req.user.id);
            if (!message) {
                return res.status(404).json({ error: 'Message not found' });
            }
            res.json({ message });
        } catch (error) {
            console.error('Toggle pin error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Get pinned messages
    router.get('/:partnerId/pinned', authenticateToken, async (req, res) => {
        try {
            const messages = await messageModel.getPinnedMessages(req.user.id, req.params.partnerId);
            res.json({ messages });
        } catch (error) {
            console.error('Get pinned messages error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Toggle reaction
    router.put('/:messageId/react', authenticateToken, async (req, res) => {
        try {
            const { type } = req.body;
            const message = await messageModel.toggleReaction(req.params.messageId, req.user.id, type);
            if (!message) {
                return res.status(404).json({ error: 'Message not found' });
            }
            res.json({ message });
        } catch (error) {
            console.error('Reaction error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });


    // Search messages
    router.get('/:partnerId/search', authenticateToken, async (req, res) => {
        try {
            const { q } = req.query;
            if (!q) return res.status(400).json({ error: 'Query required' });

            const messages = await messageModel.searchMessages(req.user.id, req.params.partnerId, q);
            res.json({ messages });
        } catch (error) {
            console.error('Search error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Get attachments
    router.get('/:partnerId/attachments', authenticateToken, async (req, res) => {
        try {
            const type = req.query.type || 'media';
            const files = await messageModel.getAttachments(req.user.id, req.params.partnerId, type);
            res.json({ files });
        } catch (error) {
            console.error('Get attachments error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    return router;
}

module.exports = createMessageRoutes;
