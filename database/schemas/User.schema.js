const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    email_notifications: {
        enabled: {
            type: Boolean,
            default: true
        },
        send_immediately: {
            type: Boolean,
            default: true  // Send when offline
        }
    },
    avatar_url: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        maxlength: 200,
        default: ''
    }
}, {
    timestamps: true, // Tự động tạo createdAt và updatedAt
    collection: 'users'
});

// Methods
userSchema.methods.toJSON = function () {
    const user = this.toObject();
    delete user.password; // Không return password ra ngoài
    return user;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
