const mongoose = require('mongoose');
const GroupSchema = require('../database/schemas/Group.schema');
const UserSchema = require('../database/schemas/User.schema');

class Group {
    constructor() {
        this.Group = GroupSchema;
        this.User = UserSchema;
    }

    async createGroup(name, adminId, memberIds = [], avatarUrl = null) {
        // Ensure admin is in members
        const allMembers = [adminId, ...memberIds];
        const uniqueMembers = [...new Set(allMembers.map(id => id.toString()))];

        const groupData = {
            name,
            admin_id: adminId,
            members: uniqueMembers
        };

        if (avatarUrl) {
            groupData.avatar_url = avatarUrl;
        }

        const group = await this.Group.create(groupData);

        // Populate members for return
        return await this.Group.findById(group._id)
            .populate('members', 'username _id avatar_url status')
            .populate('admin_id', 'username _id')
            .populate('co_admins', 'username _id');
    }

    async getUserGroups(userId) {
        return await this.Group.find({ members: userId })
            .populate('members', 'username _id avatar_url status')
            .populate('admin_id', 'username _id')
            .populate('co_admins', 'username _id')
            .sort({ created_at: -1 });
    }

    async getGroupById(groupId) {
        return await this.Group.findById(groupId)
            .populate('members', 'username _id avatar_url status')
            .populate('admin_id', 'username _id')
            .populate('co_admins', 'username _id');
    }

    async addMembers(groupId, requesterId, newMemberIds = []) {
        const group = await this.Group.findById(groupId);
        if (!group) throw new Error('Group not found');

        const requesterIdStr = requesterId.toString();
        const adminIdStr = group.admin_id.toString();
        const coAdminsStr = (group.co_admins || []).map(id => id.toString());

        const isRequesterOwner = requesterIdStr === adminIdStr;
        const isRequesterCoAdmin = coAdminsStr.includes(requesterIdStr);

        if (!isRequesterOwner && !isRequesterCoAdmin) {
            throw new Error('Chỉ có Trưởng nhóm hoặc Phó nhóm mới có quyền thêm thành viên');
        }

        let changed = false;
        newMemberIds.forEach(id => {
            if (!group.members.map(m => m.toString()).includes(id.toString())) {
                group.members.push(id);
                changed = true;
            }
        });

        if (changed) {
            await group.save();
        }

        return group;
    }

    async deleteGroup(groupId, requesterId) {
        const group = await this.Group.findById(groupId);
        if (!group) throw new Error('Group not found');

        const requesterIdStr = requesterId.toString();
        const adminIdStr = group.admin_id.toString();

        if (requesterIdStr !== adminIdStr) {
            throw new Error('Chỉ có Trưởng nhóm gốc mới có quyền giải tán nhóm');
        }

        // Dọn dẹp Message
        const Message = require('../database/schemas/Message.schema');
        await Message.deleteMany({ group_id: groupId });

        // Xóa nhóm
        await group.deleteOne();
        return true;
    }

    async kickMember(groupId, requesterId, targetId) {
        const group = await this.Group.findById(groupId);
        if (!group) throw new Error('Group not found');

        const requesterIdStr = requesterId.toString();
        const targetIdStr = targetId.toString();
        const adminIdStr = group.admin_id.toString();
        const coAdminsStr = (group.co_admins || []).map(id => id.toString());

        const isRequesterOwner = requesterIdStr === adminIdStr;
        const isRequesterCoAdmin = coAdminsStr.includes(requesterIdStr);

        if (!isRequesterOwner && !isRequesterCoAdmin) {
            throw new Error('Chỉ có Trưởng nhóm hoặc Phó nhóm mới có quyền xoá thành viên');
        }

        const isTargetOwner = targetIdStr === adminIdStr;
        const isTargetCoAdmin = coAdminsStr.includes(targetIdStr);

        if (isTargetOwner || isTargetCoAdmin) {
            throw new Error('Không thể xoá Trưởng nhóm hoặc Phó nhóm khác khỏi nhóm');
        }

        // Proceed to remove from members
        group.members = group.members.filter(id => id.toString() !== targetIdStr);
        await group.save();

        return group;
    }

    async promoteMember(groupId, requesterId, targetId) {
        const group = await this.Group.findById(groupId);
        if (!group) throw new Error('Group not found');

        const requesterIdStr = requesterId.toString();
        const targetIdStr = targetId.toString();
        const adminIdStr = group.admin_id.toString();
        const coAdminsStr = (group.co_admins || []).map(id => id.toString());

        const isRequesterOwner = requesterIdStr === adminIdStr;
        const isRequesterCoAdmin = coAdminsStr.includes(requesterIdStr);

        if (!isRequesterOwner && !isRequesterCoAdmin) {
            throw new Error('Chỉ có Trưởng nhóm hoặc Phó nhóm mới có quyền thăng cấp');
        }

        if (adminIdStr === targetIdStr || coAdminsStr.includes(targetIdStr)) {
            throw new Error('Người dùng này đã là Trưởng nhóm hoặc Phó nhóm');
        }

        if (!group.members.map(id => id.toString()).includes(targetIdStr)) {
            throw new Error('Người dùng không thuộc nhóm này');
        }

        if (!group.co_admins) {
            group.co_admins = [];
        }
        group.co_admins.push(targetId);
        await group.save();

        return group;
    }

    async updateGroupInfo(groupId, requesterId, { name, avatar_url }) {
        const group = await this.Group.findById(groupId);
        if (!group) throw new Error('Group not found');

        const requesterIdStr = requesterId.toString();
        const adminIdStr = group.admin_id.toString();
        const coAdminsStr = (group.co_admins || []).map(id => id.toString());

        const isRequesterOwner = requesterIdStr === adminIdStr;
        const isRequesterCoAdmin = coAdminsStr.includes(requesterIdStr);

        if (!isRequesterOwner && !isRequesterCoAdmin) {
            throw new Error('Chỉ có Trưởng nhóm hoặc Phó nhóm mới có quyền thay đổi thông tin nhóm.');
        }

        if (name !== undefined) {
            if (!name.trim()) throw new Error('Tên nhóm không được để trống.');
            group.name = name.trim();
        }

        if (avatar_url !== undefined) {
            group.avatar_url = avatar_url;
        }

        await group.save();
        return group;
    }

    async leaveGroup(groupId, userId) {
        const group = await this.Group.findById(groupId);
        if (!group) throw new Error('Group not found');

        const userIdStr = userId.toString();
        if (group.admin_id.toString() === userIdStr) {
            throw new Error('Trưởng nhóm gốc không thể rời nhóm. Vui lòng chuyển quyền hoặc giải tán nhóm.');
        }

        group.members = group.members.filter(id => id.toString() !== userIdStr);
        group.co_admins = (group.co_admins || []).filter(id => id.toString() !== userIdStr);

        await group.save();
        return group;
    }
}

module.exports = new Group();
