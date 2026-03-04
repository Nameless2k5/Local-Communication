const mongoose = require('mongoose');

const chatBackgroundSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    partner_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    background_url: {
        type: String,
        required: true
    }
}, {
    timestamps: true,
    collection: 'chat_backgrounds'
});

// Compound index to ensure one background per user-partner pair
chatBackgroundSchema.index({ user_id: 1, partner_id: 1 }, { unique: true });

const ChatBackground = mongoose.model('ChatBackground', chatBackgroundSchema);

module.exports = ChatBackground;
