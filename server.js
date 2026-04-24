require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const jwt = require('jsonwebtoken');

const mongodbConnection = require('./database/mongodb');
const User = require('./models/User');
const Message = require('./models/Message');
const ChatBackground = require('./models/ChatBackground');
const createAuthRoutes = require('./routes/auth');
const createUserRoutes = require('./routes/users');
const createMessageRoutes = require('./routes/messages');
const uploadRoutes = require('./routes/upload');
const createSettingsRoutes = require('./routes/settings');
const createProfileRoutes = require('./routes/profile');
const createChatBackgroundRoutes = require('./routes/chatBackgrounds');
const createGroupRoutes = require('./routes/groups');
const emailService = require('./services/email');
const Group = require('./models/Group');
const { getNicknames, setNickname } = require('./models/ConversationNickname');
const createNicknameRoutes = require('./routes/nicknames');

const app = express();
app.set('trust proxy', 1); // Trust Nginx reverse proxy
const server = http.createServer(app);

// CORS allowlist — set APP_URL (comma-separated) in .env for multiple origins
const allowedOrigins = (process.env.APP_URL || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST']
    }
});

// Initialize models
const userModel = new User();
const messageModel = new Message();
const chatBackgroundModel = new ChatBackground();

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (curl, mobile apps, same-origin Nginx proxy)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        // Reject unknown origins silently — no thrown error to avoid PM2 log spam
        return callback(null, false);
    },
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Store online users
const onlineUsers = new Map(); // userId -> socketId

// Routes
app.use('/api/auth', createAuthRoutes(userModel));
app.use('/api/users', createUserRoutes(userModel));
app.use('/api/messages', createMessageRoutes(messageModel));
app.use('/api/groups', createGroupRoutes(io, onlineUsers));
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', createSettingsRoutes(userModel));
app.use('/api/profile', createProfileRoutes(userModel, io));
app.use('/api/chat-backgrounds', createChatBackgroundRoutes(chatBackgroundModel, io, onlineUsers));
app.use('/api/nicknames', createNicknameRoutes());

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});



// Socket.IO authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return next(new Error('Authentication error'));
        }
        socket.userId = decoded.id;
        socket.username = decoded.username;
        next();
    });
});

// Socket.IO connection handling
io.on('connection', async (socket) => {
    console.log(`✓ User connected: ${socket.username} (${socket.userId})`);

    // Add user to online users
    onlineUsers.set(socket.userId, socket.id);

    // Broadcast online users list
    io.emit('users_online', Array.from(onlineUsers.keys()));

    // Automatically join all groups user belongs to
    try {
        const userGroups = await Group.getUserGroups(socket.userId);
        userGroups.forEach(group => {
            socket.join(group._id.toString());
        });
    } catch (e) {
        console.error('Lỗi khi join group rooms:', e);
    }

    // User dynamically joining a new room
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
        const { receiverId, groupId, content, attachment = null, replyToId = null } = data;
        // Allowlist message_type to prevent client-side injection of 'system' messages
        const allowedMessageTypes = ['text', 'image', 'video', 'file', 'link'];
        const message_type = allowedMessageTypes.includes(data.message_type) ? data.message_type : 'text';

        try {
            const isGroup = !!groupId;
            const targetId = isGroup ? groupId : receiverId;

            // Save message to database
            const message = await messageModel.createMessage(
                socket.userId,
                targetId,
                content,
                message_type,
                attachment,
                isGroup,
                replyToId
            );

            // Add sender info to message
            const messageWithSender = {
                ...message,
                sender: { _id: socket.userId, username: socket.username }, // For group rendering
                sender_username: socket.username
            };

            if (isGroup) {
                // Broadcast to the whole group except the sender
                socket.to(groupId).emit('receive_message', messageWithSender);
                // Send confirmation back to sender
                socket.emit('message_sent', messageWithSender);
            } else {
                // Direct message: Send to receiver if online
                const receiverSocketId = onlineUsers.get(receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('receive_message', messageWithSender);
                } else {
                    // Receiver is offline - send email notification asynchronously so it doesn't block the UI
                    (async () => {
                        try {
                            const receiver = await userModel.findUserById(receiverId);
                            if (receiver && receiver.email_notifications && receiver.email_notifications.enabled) {
                                await emailService.sendMessageNotification({
                                    to: receiver.email,
                                    recipientName: receiver.username,
                                    senderName: socket.username,
                                    messageContent: content,
                                    chatUrl: process.env.APP_URL || 'https://shittimchest.blog'
                                });
                                console.log(`📧 Email notification sent to ${receiver.username}`);
                            }
                        } catch (emailError) {
                            console.error('Failed to send email notification:', emailError);
                        }
                    })();
                }
                // Send confirmation back to sender
                socket.emit('message_sent', messageWithSender);
            }
        } catch (error) {
            console.error('Message send error:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Handle editing messages
    socket.on('edit_message', async (data) => {
        const { messageId, content, receiverId, groupId } = data;
        try {
            const isGroup = !!groupId;
            const targetId = isGroup ? groupId : receiverId;

            // Save edit to database
            const message = await messageModel.editMessage(messageId, socket.userId, content);

            // Re-format message payload for broadcast
            const messageWithSender = {
                id: message._id.toString(),
                sender_id: message.sender_id.toString(),
                receiver_id: message.receiver_id ? message.receiver_id.toString() : null,
                group_id: message.group_id ? message.group_id.toString() : null,
                content: message.content,
                message_type: message.message_type,
                attachment: message.attachment,
                is_edited: message.is_edited,
                is_deleted: message.is_deleted,
                created_at: message.createdAt,
                sender: { _id: socket.userId, username: socket.username },
                sender_username: socket.username
            };

            if (isGroup) {
                io.to(groupId).emit('message_edited', messageWithSender);
            } else {
                const receiverSocketId = onlineUsers.get(receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('message_edited', messageWithSender);
                }
                socket.emit('message_edited', messageWithSender);
            }
        } catch (error) {
            console.error('Message edit error:', error);
            socket.emit('error', { message: 'Failed to edit message' });
        }
    });

    // Handle deleting messages
    socket.on('delete_message', async (data) => {
        const { messageId, receiverId, groupId } = data;
        try {
            const isGroup = !!groupId;

            await messageModel.deleteMessage(messageId, socket.userId);

            const deletePayload = {
                messageId,
                groupId,
                receiverId
            };

            if (isGroup) {
                io.to(groupId).emit('message_deleted', deletePayload);
            } else {
                const receiverSocketId = onlineUsers.get(receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('message_deleted', deletePayload);
                }
                socket.emit('message_deleted', deletePayload);
            }
        } catch (error) {
            console.error('Message delete error:', error);
            socket.emit('error', { message: 'Failed to delete message' });
        }
    });

    // Handle forward message
    socket.on('forward_message', async (data) => {
        try {
            const { originalMessageId, targetGroups, targetUsers } = data;

            // Validate payload
            if (!originalMessageId || (!targetGroups?.length && !targetUsers?.length)) {
                return socket.emit('error', { message: 'Invalid forward payload data' });
            }

            // Create cloned messages in DB
            const forwardedMsgs = await messageModel.forwardMessage(
                originalMessageId,
                socket.userId,
                targetGroups,
                targetUsers
            );

            // Broadcast each new message to its respective room/user
            for (const msg of forwardedMsgs) {
                if (msg.group_id) {
                    const groupIdStr = msg.group_id.toString();
                    // Broadcast to others in group
                    socket.to(groupIdStr).emit('receive_message', msg);
                    // Loop back to sender
                    socket.emit('message_sent', msg);
                } else if (msg.receiver_id) {
                    const receiverIdStr = msg.receiver_id.toString();
                    const receiverSocketId = onlineUsers.get(receiverIdStr);
                    if (receiverSocketId) {
                        io.to(receiverSocketId).emit('receive_message', msg);
                    }
                    // Loop back to sender to update UI properly
                    socket.emit('message_sent', msg);
                }
            }
        } catch (error) {
            console.error('Message forward error:', error);
            socket.emit('error', { message: 'Failed to forward message' });
        }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
        const { receiverId, groupId } = data;
        const payload = {
            userId: socket.userId,
            username: socket.username,
            groupId
        };

        if (groupId) {
            socket.to(groupId).emit('user_typing', payload);
        } else if (receiverId) {
            const receiverSocketId = onlineUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('user_typing', payload);
            }
        }
    });

    // Handle stop typing
    socket.on('stop_typing', (data) => {
        const { receiverId, groupId } = data;
        const payload = {
            userId: socket.userId,
            groupId
        };

        if (groupId) {
            socket.to(groupId).emit('user_stop_typing', payload);
        } else if (receiverId) {
            const receiverSocketId = onlineUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('user_stop_typing', payload);
            }
        }
    });

    // Handle marking messages as read
    socket.on('mark_messages_read', async (data) => {
        const { messageIds, isGroup, groupId, senderId } = data;
        try {
            if (messageIds && messageIds.length > 0) {
                await messageModel.markMessagesAsRead(messageIds, socket.userId, isGroup);

                if (isGroup && groupId) {
                    io.to(groupId).emit('messages_read', {
                        messageIds,
                        userId: socket.userId,
                        groupId
                    });
                } else if (!isGroup && senderId) {
                    const senderSocketId = onlineUsers.get(senderId);
                    if (senderSocketId) {
                        io.to(senderSocketId).emit('messages_read', {
                            messageIds,
                            userId: socket.userId
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Mark read error:', error);
        }
    });

    // Message Reaction
    socket.on('message_reaction', async ({ messageId, receiverId, type }) => {
        console.log(`[Socket] Reaction received: msg=${messageId}, user=${socket.userId}, type=${type}`);
        try {
            // Toggle reaction in DB
            const message = await messageModel.toggleReaction(messageId, socket.userId, type);

            if (message) {
                console.log('[Socket] Reaction saved, broadcasting update');
                // Notify receiver if online
                const receiverSocketId = onlineUsers.get(receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('message_reaction_update', {
                        messageId,
                        userId: socket.userId,
                        reactions: message.reactions
                    });
                }

                // Notify sender (for UI update consistency)
                socket.emit('message_reaction_update', {
                    messageId,
                    userId: socket.userId,
                    reactions: message.reactions
                });
            } else {
                console.warn('[Socket] Message not found or toggle failed');
            }
        } catch (error) {
            console.error('Socket reaction error:', error);
        }
    });

    // Message Pin Updated
    socket.on('pin_updated', (data) => {
        const { groupId, receiverId } = data;
        if (groupId) {
            socket.to(groupId).emit('refresh_pinned');
        } else if (receiverId) {
            const receiverSocketId = onlineUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('refresh_pinned');
            }
        }
    });

    // === WebRTC Signaling ===
    socket.on('request_call', (data) => {
        const { callerId, callerName, callerAvatar, receiverId, isVideo } = data;
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('incoming_call', {
                callerId,
                callerName,
                callerAvatar,
                isVideo
            });
        } else {
            socket.emit('call_rejected', { reason: 'offline' });
        }
    });

    socket.on('accept_call', (data) => {
        const { callerId } = data;
        const callerSocketId = onlineUsers.get(callerId);
        if (callerSocketId) {
            io.to(callerSocketId).emit('call_accepted', { receiverId: socket.userId });
        }
    });

    socket.on('reject_call', (data) => {
        const { callerId } = data;
        const callerSocketId = onlineUsers.get(callerId);
        if (callerSocketId) {
            io.to(callerSocketId).emit('call_rejected', { reason: 'declined' });
        }
    });

    socket.on('end_call', (data) => {
        const { to } = data;
        const targetSocketId = onlineUsers.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('end_call');
        }
    });

    socket.on('webrtc_offer', (data) => {
        const { to, offer } = data;
        const targetSocketId = onlineUsers.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('webrtc_offer', { from: socket.userId, offer });
        }
    });

    socket.on('webrtc_answer', (data) => {
        const { to, answer } = data;
        const targetSocketId = onlineUsers.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('webrtc_answer', { from: socket.userId, answer });
        }
    });

    socket.on('webrtc_ice_candidate', (data) => {
        const { to, candidate } = data;
        const targetSocketId = onlineUsers.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('webrtc_ice_candidate', { from: socket.userId, candidate });
        }
    });

    // Handle setting conversation nickname (Messenger-like)
    socket.on('set_nickname', async (data) => {
        const { partnerId, targetUserId, nickname } = data;
        try {
            // Validate targetUserId is one of the two participants (prevents IDOR)
            if (targetUserId !== socket.userId && targetUserId !== partnerId) {
                return socket.emit('error', { message: 'Invalid target user' });
            }
            // Save to DB
            const updatedNicknames = await setNickname(socket.userId, partnerId, targetUserId, nickname);

            // Get target user info for system message
            const targetUser = await userModel.findUserById(targetUserId);
            const targetDisplayName = targetUser ? targetUser.username : 'Người dùng';

            const systemContent = nickname
                ? `${socket.username} đã đặt biệt danh cho ${targetDisplayName} là "${nickname}"`
                : `${socket.username} đã xóa biệt danh của ${targetDisplayName}`;

            // Create system message in DB
            const sysMessage = await messageModel.createMessage(
                socket.userId, partnerId, systemContent, 'system'
            );
            const sysPayload = { ...sysMessage, sender_username: socket.username };

            const updatePayload = {
                user1: socket.userId,  // who triggered
                user2: partnerId,      // the other person
                nicknames: updatedNicknames,
                systemMessage: sysPayload
            };

            // Emit to partner
            const partnerSocketId = onlineUsers.get(partnerId);
            if (partnerSocketId) {
                io.to(partnerSocketId).emit('nickname_updated', updatePayload);
            }
            // Emit back to sender
            socket.emit('nickname_updated', updatePayload);
        } catch (error) {
            console.error('Set nickname error:', error);
            socket.emit('error', { message: 'Failed to set nickname' });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`✗ User disconnected: ${socket.username}`);
        onlineUsers.delete(socket.userId);
        io.emit('users_online', Array.from(onlineUsers.keys()));
    });
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/local-communication';

// Connect to MongoDB and start server
async function startServer() {
    try {
        // Connect to MongoDB
        await mongodbConnection.connect(MONGODB_URI);

        // Start Express server
        server.listen(PORT, () => {
            console.log(`\n🚀 Server running on http://localhost:${PORT}`);
            console.log(`📡 Socket.IO ready for real-time connections`);
            console.log(`💾 Using MongoDB for persistent storage\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\nShutting down gracefully...');
    await mongodbConnection.disconnect();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Start the server
startServer();
