const mongoose = require('mongoose');
const MessageSchema = require('../database/schemas/Message.schema');

class Message {
    constructor() {
        this.Message = MessageSchema;
    }

    async createMessage(senderId, receiverId, content, messageType = 'text', attachment = null, isGroup = false, replyToId = null) {
        const messageData = {
            sender_id: senderId,
            content,
            message_type: messageType
        };

        if (isGroup) {
            messageData.group_id = receiverId;
        } else {
            messageData.receiver_id = receiverId;
        }

        if (attachment) {
            messageData.attachment = attachment;
        }

        if (replyToId) {
            messageData.reply_to = replyToId;
        }

        const message = await this.Message.create(messageData);
        // Cần populate reply_to để trả về ngay cho socket biết
        await message.populate({
            path: 'reply_to',
            populate: { path: 'sender_id', select: 'username' }
        });

        return {
            id: message._id.toString(),
            sender_id: message.sender_id.toString(),
            receiver_id: message.receiver_id ? message.receiver_id.toString() : null,
            group_id: message.group_id ? message.group_id.toString() : null,
            content: message.content,
            message_type: message.message_type,
            attachment: message.attachment,
            read: message.read,
            read_by: message.read_by,
            is_pinned: message.is_pinned,
            is_edited: message.is_edited,
            is_deleted: message.is_deleted,
            is_forwarded: message.is_forwarded || false,
            reply_to: message.reply_to ? {
                id: message.reply_to._id.toString(),
                content: message.reply_to.content,
                message_type: message.reply_to.message_type,
                sender_name: message.reply_to.sender_id ? message.reply_to.sender_id.username : 'Unknown'
            } : null,
            reactions: message.reactions,
            created_at: message.createdAt
        };
    }

    async getConversation(userId1, userId2) {
        const messages = await this.Message.find({
            $or: [
                { sender_id: userId1, receiver_id: userId2 },
                { sender_id: userId2, receiver_id: userId1 }
            ]
        })
            .populate({
                path: 'reply_to',
                populate: { path: 'sender_id', select: 'username' }
            })
            .sort({ createdAt: 1 }); // Oldest first

        return messages.map(message => ({
            id: message._id.toString(),
            sender_id: message.sender_id.toString(),
            receiver_id: message.receiver_id ? message.receiver_id.toString() : null,
            group_id: message.group_id ? message.group_id.toString() : null,
            content: message.content,
            message_type: message.message_type,
            attachment: message.attachment,
            read: message.read,
            read_by: message.read_by,
            is_pinned: message.is_pinned,
            is_edited: message.is_edited,
            is_deleted: message.is_deleted,
            is_forwarded: message.is_forwarded || false,
            reply_to: message.reply_to ? {
                id: message.reply_to._id.toString(),
                content: message.reply_to.content,
                message_type: message.reply_to.message_type,
                sender_name: message.reply_to.sender_id ? message.reply_to.sender_id.username : 'Unknown'
            } : null,
            reactions: message.reactions,
            created_at: message.createdAt
        }));
    }

    async markAsRead(userId, senderId) {
        await this.Message.updateMany(
            {
                sender_id: senderId,
                receiver_id: userId,
                read: false
            },
            {
                $set: { read: true }
            }
        );
    }

    async markMessagesAsRead(messageIds, userId, isGroup = false) {
        if (!messageIds || messageIds.length === 0) return;

        if (isGroup) {
            // For group messages, we add the userId to the read_by array
            // only if they are not already in it.
            return await this.Message.updateMany(
                {
                    _id: { $in: messageIds },
                    'read_by.user_id': { $ne: userId }
                },
                {
                    $addToSet: {
                        read_by: {
                            user_id: new mongoose.Types.ObjectId(userId),
                            read_at: new Date()
                        }
                    }
                }
            );
        } else {
            // For 1-1 messages, we just set `read` to true
            return await this.Message.updateMany(
                { _id: { $in: messageIds } },
                { $set: { read: true } }
            );
        }
    }

    async getUnreadCount(userId) {
        return await this.Message.countDocuments({
            receiver_id: userId,
            read: false
        });
    }

    async togglePin(messageId, userId) {
        const message = await this.Message.findById(messageId);
        if (!message) return null;

        if (message.group_id) {
            // For group messages: check that user is a member of the group
            const GroupSchema = require('../database/schemas/Group.schema');
            const membership = await GroupSchema.findOne({ _id: message.group_id, members: userId });
            if (!membership) throw new Error('Unauthorized');
        } else {
            // For direct messages: check user is sender or receiver
            if (message.sender_id.toString() !== userId && message.receiver_id.toString() !== userId) {
                throw new Error('Unauthorized');
            }
        }

        message.is_pinned = !message.is_pinned;
        await message.save();

        return message;
    }

    async forwardMessage(originalMessageId, senderId, targetGroups, targetUsers) {
        const originalMsg = await this.Message.findById(originalMessageId);
        if (!originalMsg) throw new Error('Original message not found');

        const GroupSchema = require('../database/schemas/Group.schema');

        // Authorization: verify sender has access to the original message
        if (originalMsg.group_id) {
            const membership = await GroupSchema.findOne({ _id: originalMsg.group_id, members: senderId });
            if (!membership) throw new Error('Unauthorized: no access to original message');
        } else if (originalMsg.receiver_id) {
            const senderIdStr = senderId.toString();
            if (originalMsg.sender_id.toString() !== senderIdStr &&
                originalMsg.receiver_id.toString() !== senderIdStr) {
                throw new Error('Unauthorized: no access to original message');
            }
        }

        // Authorization: verify sender is a member of every target group
        if (targetGroups && targetGroups.length > 0) {
            for (const groupId of targetGroups) {
                const membership = await GroupSchema.findOne({ _id: groupId, members: senderId });
                if (!membership) throw new Error(`Unauthorized: not a member of group ${groupId}`);
            }
        }

        const forwardedMessages = [];

        // Base object to clone from original message
        const baseMsgData = {
            sender_id: senderId,
            content: originalMsg.content,
            message_type: originalMsg.message_type,
            attachment: originalMsg.attachment,
            is_forwarded: true // Mark as forwarded
        };

        // 1. Forward to Groups
        if (targetGroups && targetGroups.length > 0) {
            for (const groupId of targetGroups) {
                const newMsg = new this.Message({
                    ...baseMsgData,
                    group_id: groupId
                });
                await newMsg.save();
                const populated = await this.Message.findById(newMsg._id)
                    .populate('sender_id', 'username display_name avatar profile_color');
                forwardedMessages.push(populated);
            }
        }

        // 2. Forward to Users (Direct Messages)
        if (targetUsers && targetUsers.length > 0) {
            for (const receiverId of targetUsers) {
                const newMsg = new this.Message({
                    ...baseMsgData,
                    receiver_id: receiverId
                });
                await newMsg.save();
                const populated = await this.Message.findById(newMsg._id)
                    .populate('sender_id', 'username display_name avatar profile_color');
                forwardedMessages.push(populated);
            }
        }

        return forwardedMessages;
    }

    async getPinnedMessages(userId1, userId2) {
        return await this.Message.find({
            $or: [
                { sender_id: userId1, receiver_id: userId2 },
                { sender_id: userId2, receiver_id: userId1 },
                { group_id: userId2 }
            ],
            is_pinned: true,
            is_deleted: false
        }).sort({ createdAt: 1 });
    }

    async getAttachments(userId1, userId2, type = 'media') {
        const query = {
            $or: [
                { sender_id: userId1, receiver_id: userId2 },
                { sender_id: userId2, receiver_id: userId1 },
                { group_id: userId2 }
            ],
            'attachment.file_url': { $exists: true },
            is_deleted: false
        };

        if (type === 'media') {
            query['message_type'] = { $in: ['image', 'video'] };
        } else if (type === 'file') {
            query['message_type'] = 'file';
        }

        return await this.Message.find(query).sort({ createdAt: -1 });
    }
    async toggleReaction(messageId, userId, type) {
        console.log(`[Model] toggleReaction: msg=${messageId}, user=${userId}, type=${type}`);
        const message = await this.Message.findById(messageId);
        if (!message) {
            console.warn('[Model] Message not found');
            return null;
        }

        // Authorization check
        if (message.group_id) {
            const GroupSchema = require('../database/schemas/Group.schema');
            const membership = await GroupSchema.findOne({ _id: message.group_id, members: userId });
            if (!membership) throw new Error('Unauthorized');
        } else {
            if (message.sender_id.toString() !== userId.toString() &&
                message.receiver_id.toString() !== userId.toString()) {
                throw new Error('Unauthorized');
            }
        }

        // Ensure reactions array exists
        if (!message.reactions) {
            message.reactions = [];
        }

        const existingReactionIndex = message.reactions.findIndex(r => r.user_id.toString() === userId);
        console.log(`[Model] Existing reaction index: ${existingReactionIndex}`);

        if (existingReactionIndex > -1) {
            // If same reaction, remove it (toggle off)
            if (message.reactions[existingReactionIndex].reaction_type === type) {
                message.reactions.splice(existingReactionIndex, 1);
                console.log('[Model] Removed reaction');
            } else {
                // If different reaction, update it
                message.reactions[existingReactionIndex].reaction_type = type;
                console.log('[Model] Updated reaction type');
            }
        } else {
            // New reaction
            message.reactions.push({
                user_id: new mongoose.Types.ObjectId(userId),
                reaction_type: type
            });
            console.log('[Model] Added new reaction');
        }

        await message.save();
        return message;
    }

    async searchMessages(userId, partnerId, query) {
        const messages = await this.Message.find({
            $text: { $search: query },
            $or: [
                { sender_id: userId, receiver_id: partnerId },
                { sender_id: partnerId, receiver_id: userId },
                { group_id: partnerId }
            ]
        })
            .populate({
                path: 'reply_to',
                populate: { path: 'sender_id', select: 'username' }
            })
            .sort({ createdAt: -1 }); // Newest first

        return messages.map(message => ({
            id: message._id.toString(),
            sender_id: message.sender_id.toString(),
            receiver_id: message.receiver_id ? message.receiver_id.toString() : null,
            group_id: message.group_id ? message.group_id.toString() : null,
            content: message.content,
            message_type: message.message_type,
            attachment: message.attachment,
            read: message.read,
            read_by: message.read_by,
            is_pinned: message.is_pinned,
            is_edited: message.is_edited,
            is_deleted: message.is_deleted,
            reply_to: message.reply_to ? {
                id: message.reply_to._id.toString(),
                content: message.reply_to.content,
                message_type: message.reply_to.message_type,
                sender_name: message.reply_to.sender_id ? message.reply_to.sender_id.username : 'Unknown'
            } : null,
            created_at: message.createdAt
        }));
    }

    async getGroupMessages(groupId) {
        const messages = await this.Message.find({ group_id: groupId })
            .populate('sender_id', 'username avatar_url _id')
            .populate({
                path: 'reply_to',
                populate: { path: 'sender_id', select: 'username' }
            })
            .sort({ createdAt: 1 });

        return messages.map(message => ({
            id: message._id.toString(),
            sender_id: message.sender_id._id ? message.sender_id._id.toString() : message.sender_id.toString(),
            sender: message.sender_id, // include populated user info
            group_id: message.group_id.toString(),
            content: message.content,
            message_type: message.message_type,
            attachment: message.attachment,
            read: message.read,
            read_by: message.read_by,
            is_pinned: message.is_pinned,
            is_edited: message.is_edited,
            is_deleted: message.is_deleted,
            is_forwarded: message.is_forwarded || false,
            reply_to: message.reply_to ? {
                id: message.reply_to._id.toString(),
                content: message.reply_to.content,
                message_type: message.reply_to.message_type,
                sender_name: message.reply_to.sender_id ? message.reply_to.sender_id.username : 'Unknown'
            } : null,
            reactions: message.reactions,
            created_at: message.createdAt
        }));
    }

    async editMessage(messageId, userId, newContent) {
        const message = await this.Message.findById(messageId);

        if (!message) {
            throw new Error('Message not found');
        }

        // Only sender can edit their message
        if (message.sender_id.toString() !== userId.toString()) {
            throw new Error('Unauthorized to edit this message');
        }

        // Cannot edit deleted messages
        if (message.is_deleted) {
            throw new Error('Cannot edit a deleted message');
        }

        message.content = newContent;
        message.is_edited = true;
        await message.save();

        return message;
    }

    async deleteMessage(messageId, userId) {
        const message = await this.Message.findById(messageId);

        if (!message) {
            throw new Error('Message not found');
        }

        // Only sender can delete their message
        if (message.sender_id.toString() !== userId.toString()) {
            throw new Error('Unauthorized to delete this message');
        }

        message.is_deleted = true;
        message.content = 'Tin nhắn đã thu hồi';
        await message.save();

        return message;
    }
}

module.exports = Message;
