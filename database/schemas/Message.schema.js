const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Optional for group messages
    },
    group_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: false // Optional for direct messages
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    message_type: {
        type: String,
        enum: ['text', 'image', 'video', 'file', 'link'],
        default: 'text'
    },
    attachment: {
        filename: String,        // Original filename
        stored_name: String,     // UUID filename on server
        file_path: String,       // Relative path: /uploads/...
        file_url: String,        // Full URL to access
        mime_type: String,       // image/jpeg, video/mp4, etc.
        file_size: Number,       // Bytes
        thumbnail_url: String    // For images/videos (optional)
    },
    read: {
        type: Boolean,
        default: false
    },
    read_by: [{
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        read_at: {
            type: Date,
            default: Date.now
        }
    }],
    is_deleted: {
        type: Boolean,
        default: false
    },
    is_edited: {
        type: Boolean,
        default: false
    },
    is_forwarded: {
        type: Boolean,
        default: false
    },
    is_pinned: {
        type: Boolean,
        default: false
    },
    reply_to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    reactions: [{
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reaction_type: String, // Renamed from 'type' to avoid Mongoose conflict
        created_at: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true, // Tự động tạo createdAt và updatedAt
    collection: 'messages'
});

// Indexes
messageSchema.index({ sender_id: 1, receiver_id: 1 });
messageSchema.index({ createdAt: -1 }); // Descending order
messageSchema.index({ content: 'text' }); // Text search index

// Prevent OverwriteModelError
if (mongoose.models.Message) {
    delete mongoose.models.Message;
}

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
