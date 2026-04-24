const mongoose = require('mongoose');

const ConversationNicknameSchema = new mongoose.Schema({
    // Always stored as a sorted [userId1, userId2] pair
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    nicknames: [{
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        nickname: {
            type: String,
            trim: true,
            maxlength: 50,
            default: ''
        }
    }]
}, {
    timestamps: true,
    collection: 'conversation_nicknames'
});

ConversationNicknameSchema.index({ participants: 1 });

module.exports = mongoose.model('ConversationNickname', ConversationNicknameSchema);
