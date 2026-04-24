const ConversationNicknameSchema = require('../database/schemas/ConversationNickname.schema');

/**
 * Sort two user IDs to get a consistent pair key
 */
function getSortedPair(userId1, userId2) {
    return [userId1, userId2].map(String).sort();
}

/**
 * Get the nickname document for a conversation between two users
 */
async function getNicknames(userId1, userId2) {
    const sorted = getSortedPair(userId1, userId2);
    const doc = await ConversationNicknameSchema.findOne({
        participants: { $all: sorted, $size: 2 }
    });
    if (!doc) return [];
    return doc.nicknames.map(n => ({
        user_id: n.user_id.toString(),
        nickname: n.nickname
    }));
}

/**
 * Set nickname for a target user in a conversation.
 * Pass empty string to clear the nickname.
 */
async function setNickname(userId1, userId2, targetUserId, nickname) {
    const sorted = getSortedPair(userId1, userId2);

    let doc = await ConversationNicknameSchema.findOne({
        participants: { $all: sorted, $size: 2 }
    });

    if (!doc) {
        doc = new ConversationNicknameSchema({ participants: sorted, nicknames: [] });
    }

    const existing = doc.nicknames.find(n => n.user_id.toString() === targetUserId);
    if (existing) {
        existing.nickname = nickname;
    } else {
        doc.nicknames.push({ user_id: targetUserId, nickname });
    }

    await doc.save();

    return doc.nicknames.map(n => ({
        user_id: n.user_id.toString(),
        nickname: n.nickname
    }));
}

/**
 * Get a map of { partnerId: nickname } for all conversations the user is in.
 * Returns only entries where a non-empty nickname exists for the partner.
 */
async function getAllNicknamesForUser(userId) {
    const docs = await ConversationNicknameSchema.find({ participants: userId });
    const result = {};
    for (const doc of docs) {
        const partnerId = doc.participants.find(p => p.toString() !== userId.toString());
        if (!partnerId) continue;
        const entry = doc.nicknames.find(n => n.user_id.toString() === partnerId.toString());
        if (entry && entry.nickname) {
            result[partnerId.toString()] = entry.nickname;
        }
    }
    return result;
}

module.exports = { getNicknames, setNickname, getAllNicknamesForUser };
