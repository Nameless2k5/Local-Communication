const bcrypt = require('bcryptjs');
const UserSchema = require('../database/schemas/User.schema');

class User {
    constructor() {
        this.User = UserSchema;
    }

    async createUser(username, email, password) {
        try {
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create user
            const user = await this.User.create({
                username,
                email,
                password: hashedPassword
            });

            return {
                id: user._id.toString(),
                username: user.username,
                email: user.email,
                created_at: user.createdAt
            };
        } catch (error) {
            // Handle duplicate key error
            if (error.code === 11000) {
                const field = Object.keys(error.keyPattern)[0];
                throw new Error(`${field} already exists`);
            }
            throw error;
        }
    }

    async findUserByUsername(username) {
        const user = await this.User.findOne({ username });
        if (!user) return null;

        return {
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            password: user.password, // Needed for login validation
            created_at: user.createdAt
        };
    }

    async findUserByEmail(email) {
        const user = await this.User.findOne({ email });
        if (!user) return null;

        return {
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            password: user.password,
            created_at: user.createdAt
        };
    }

    async findUserById(id) {
        const user = await this.User.findById(id);
        if (!user) return null;

        return {
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            avatar_url: user.avatar_url,
            bio: user.bio,
            email_notifications: user.email_notifications,
            created_at: user.createdAt
        };
    }

    /**
     * Get user profile (public data)
     */
    async getProfile(id) {
        const user = await this.User.findById(id).select('-password');
        if (!user) return null;

        return {
            id: user._id.toString(),
            username: user.username,
            avatar_url: user.avatar_url,
            bio: user.bio,
            created_at: user.createdAt
        };
    }

    /**
     * Update user profile (bio only)
     */
    async updateProfile(userId, updates) {
        const allowedUpdates = ['bio'];
        const filteredUpdates = {};

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                filteredUpdates[key] = updates[key];
            }
        });

        const user = await this.User.findByIdAndUpdate(
            userId,
            filteredUpdates,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) throw new Error('User not found');

        return {
            id: user._id.toString(),
            username: user.username,
            avatar_url: user.avatar_url,
            bio: user.bio
        };
    }

    /**
     * Update avatar URL
     */
    async updateAvatar(userId, avatarUrl) {
        const user = await this.User.findByIdAndUpdate(
            userId,
            { avatar_url: avatarUrl },
            { new: true }
        ).select('-password');

        if (!user) throw new Error('User not found');

        return {
            id: user._id.toString(),
            avatar_url: user.avatar_url
        };
    }

    /**
     * Update email notification settings
     */
    async updateSettings(userId, settings) {
        const user = await this.User.findByIdAndUpdate(
            userId,
            { email_notifications: settings },
            { new: true }
        ).select('-password');

        if (!user) throw new Error('User not found');

        return {
            id: user._id.toString(),
            email_notifications: user.email_notifications
        };
    }

    async getAllUsers(excludeUserId = null) {
        const query = excludeUserId ? { _id: { $ne: excludeUserId } } : {};
        const users = await this.User.find(query).select('-password');

        return users.map(user => ({
            id: user._id.toString(),
            username: user.username,
            avatar_url: user.avatar_url,
            bio: user.bio,
            created_at: user.createdAt
        }));
    }

    async validatePassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }
}

module.exports = User;
