const ChatBackgroundSchema = require('../database/schemas/ChatBackground.schema');

class ChatBackground {
    constructor() {
        this.ChatBackground = ChatBackgroundSchema;
    }

    /**
     * Set custom background for a conversation
     */
    async setBackground(userId, partnerId, backgroundUrl) {
        try {
            const background = await this.ChatBackground.findOneAndUpdate(
                { user_id: userId, partner_id: partnerId },
                { background_url: backgroundUrl },
                { upsert: true, new: true }
            );

            return {
                id: background._id.toString(),
                user_id: background.user_id.toString(),
                partner_id: background.partner_id.toString(),
                background_url: background.background_url,
                created_at: background.createdAt
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get background for a conversation
     */
    async getBackground(userId, partnerId) {
        const background = await this.ChatBackground.findOne({
            user_id: userId,
            partner_id: partnerId
        });

        if (!background) return null;

        return {
            id: background._id.toString(),
            background_url: background.background_url
        };
    }

    /**
     * Delete custom background (reset to default)
     */
    async deleteBackground(userId, partnerId) {
        const result = await this.ChatBackground.deleteOne({
            user_id: userId,
            partner_id: partnerId
        });

        return result.deletedCount > 0;
    }
}

module.exports = ChatBackground;
