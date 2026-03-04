const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Group = require('../models/Group');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const dir = 'uploads/avatars';
        try {
            await fs.mkdir(dir, { recursive: true });
            cb(null, dir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    if (allowedTypes.test(path.extname(file.originalname).toLowerCase()) && allowedTypes.test(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

function createGroupRoutes(io, onlineUsers) {
    const router = express.Router();

    // Lấy danh sách group của user hiện tại
    router.get('/', authenticateToken, async (req, res) => {
        try {
            const groups = await Group.getUserGroups(req.user.id);
            res.json(groups);
        } catch (error) {
            console.error('Lỗi khi lấy danh sách nhóm:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Tạo group mới
    router.post('/', authenticateToken, async (req, res) => {
        try {
            const { name, members, avatar_url } = req.body;

            if (!name || !members || !Array.isArray(members)) {
                return res.status(400).json({ error: 'Dữ liệu không hợp lệ. name và members (array) là bắt buộc.' });
            }

            const group = await Group.createGroup(name, req.user.id, members, avatar_url);

            // Báo cho các user thuộc group (đang online) biết có group mới
            if (onlineUsers) {
                group.members.forEach(member => {
                    const socketId = onlineUsers.get(member._id.toString());
                    if (socketId) {
                        io.to(socketId).emit('group_created', group);
                    }
                });
            }

            // Gửi luôn event báo cho mọi người join room socket
            io.emit('notify_join_group', { groupId: group._id, members: group.members.map(m => m._id.toString()) });

            res.status(201).json(group);
        } catch (error) {
            console.error('Lỗi khi tạo nhóm:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Lấy tin nhắn của group
    router.get('/:groupId/messages', authenticateToken, async (req, res) => {
        try {
            const groupId = req.params.groupId;
            // Get messages (We should pass Message Model here or require it)
            const MessageModel = require('../models/Message');
            const msgModel = new MessageModel();
            const messages = await msgModel.getGroupMessages(groupId);
            res.json({ messages });
        } catch (error) {
            console.error('Lỗi khi tải tin nhắn nhóm:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Kick thành viên (Chỉ admin hoặc co-admin)
    router.post('/:groupId/kick', authenticateToken, async (req, res) => {
        try {
            const groupId = req.params.groupId;
            const { targetId } = req.body;

            if (!targetId) {
                return res.status(400).json({ error: 'Missing targetId' });
            }

            const updatedGroup = await Group.kickMember(groupId, req.user.id, targetId);

            // Báo cho các user (kể cả người bị kick) để cập nhật UI & rời phòng
            io.emit('group_member_kicked', { groupId, targetId, kickedBy: req.user.id });

            res.json(updatedGroup);
        } catch (error) {
            console.error('Lỗi khi xoá thành viên:', error);
            res.status(403).json({ error: error.message || 'Không có quyền thực hiện' });
        }
    });

    // Thăng cấp thành viên thành Đồng trưởng nhóm (Chỉ admin hoặc co-admin)
    router.post('/:groupId/promote', authenticateToken, async (req, res) => {
        try {
            const groupId = req.params.groupId;
            const { targetId } = req.body;

            if (!targetId) {
                return res.status(400).json({ error: 'Missing targetId' });
            }

            const updatedGroup = await Group.promoteMember(groupId, req.user.id, targetId);

            // Báo cho các user trong nhóm về update roles
            io.to(groupId).emit('group_updated', updatedGroup);

            res.json(updatedGroup);
        } catch (error) {
            console.error('Lỗi khi thăng cấp thành viên:', error);
            res.status(403).json({ error: error.message || 'Không có quyền thực hiện' });
        }
    });

    // Cập nhật thông tin nhóm (Tên)
    router.put('/:groupId/info', authenticateToken, async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) return res.status(400).json({ error: 'Tên nhóm không được để trống' });

            const updatedGroup = await Group.updateGroupInfo(req.params.groupId, req.user.id, { name });
            io.emit('group_updated', updatedGroup);
            res.json(updatedGroup);
        } catch (error) {
            res.status(403).json({ error: error.message });
        }
    });

    // Cập nhật ảnh đại diện nhóm
    router.post('/:groupId/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Chưa tải file lên' });

            const originalPath = req.file.path;
            const optimizedFilename = `group-avatar-${req.file.filename}`;
            const optimizedPath = path.join('uploads/avatars', optimizedFilename);

            await sharp(originalPath)
                .resize(400, 400, { fit: 'cover', position: 'center' })
                .jpeg({ quality: 85 })
                .toFile(optimizedPath);

            await fs.unlink(originalPath); // Xoá file gốc chỉ giữ file nén

            const avatarUrl = `/uploads/avatars/${optimizedFilename}`;
            const updatedGroup = await Group.updateGroupInfo(req.params.groupId, req.user.id, { avatar_url: avatarUrl });

            io.emit('group_updated', updatedGroup);
            res.json(updatedGroup);
        } catch (error) {
            if (req.file) {
                try { await fs.unlink(req.file.path); } catch (e) { }
            }
            res.status(403).json({ error: error.message || 'Lỗi cập nhật ảnh' });
        }
    });

    // Tự rời nhóm
    router.post('/:groupId/leave', authenticateToken, async (req, res) => {
        try {
            const updatedGroup = await Group.leaveGroup(req.params.groupId, req.user.id);

            // Re-use logic của member_kicked (tự mình kick mình)
            io.emit('group_member_kicked', {
                groupId: req.params.groupId,
                targetId: req.user.id,
                kickedBy: req.user.id
            });

            res.json(updatedGroup);
        } catch (error) {
            console.error('Lỗi khi rời nhóm:', error);
            res.status(403).json({ error: error.message || 'Không có quyền thực hiện' });
        }
    });

    // Thêm các thành viên mới vào nhóm (Chỉ admin / co-admin)
    router.post('/:groupId/members', authenticateToken, async (req, res) => {
        try {
            const { targetIds } = req.body;
            if (!targetIds || !Array.isArray(targetIds)) {
                return res.status(400).json({ error: 'Dữ liệu targetIds phải là mảng hợp lệ' });
            }

            await Group.addMembers(req.params.groupId, req.user.id, targetIds);
            const updatedGroup = await Group.getGroupById(req.params.groupId);

            // Cập nhật lại list ở client của người vốn đã trong phòng
            io.to(req.params.groupId).emit('group_updated', updatedGroup);

            // Gửi event group_created cho người "mới được thêm vào" để client tự vẽ list
            if (onlineUsers) {
                targetIds.forEach(id => {
                    const socketId = onlineUsers.get(id.toString());
                    if (socketId) {
                        io.to(socketId).emit('group_created', updatedGroup);
                    }
                });
            }
            res.json(updatedGroup);
        } catch (error) {
            console.error('Lỗi khi thêm thành viên:', error);
            res.status(403).json({ error: error.message || 'Không có quyền thực hiện' });
        }
    });

    // Giải tán nhóm (Chỉ Admin)
    router.delete('/:groupId', authenticateToken, async (req, res) => {
        try {
            await Group.deleteGroup(req.params.groupId, req.user.id);

            // Emit huỷ cho MỌI NGƯỜI để họ văng ra ngoài, tắt danh bạ
            io.emit('group_deleted', { groupId: req.params.groupId });

            res.json({ success: true, message: 'Giải tán nhóm thành công' });
        } catch (error) {
            console.error('Lỗi khi xoá nhóm:', error);
            res.status(403).json({ error: error.message || 'Không có quyền thực hiện' });
        }
    });

    return router;
}

module.exports = createGroupRoutes;
