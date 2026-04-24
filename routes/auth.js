const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../middleware/auth');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 10,
    message: { error: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' },
    standardHeaders: true,
    legacyHeaders: false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 giờ
    max: 5,
    message: { error: 'Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau 1 giờ.' },
    standardHeaders: true,
    legacyHeaders: false
});

function createAuthRoutes(userModel) {
    const router = express.Router();

    // Register new user
    router.post('/register', registerLimiter, async (req, res) => {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        try {
            const user = await userModel.createUser(username, email, password);
            const token = jwt.sign(
                { id: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            const fullUser = await userModel.findUserById(user.id);

            res.status(201).json({
                message: 'User registered successfully',
                token,
                user: fullUser
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    // Login
    router.post('/login', loginLimiter, async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        try {
            const user = await userModel.findUserByUsername(username);

            if (!user) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const isValid = await userModel.validatePassword(password, user.password);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const token = jwt.sign(
                { id: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            // Get full user data including avatar
            const fullUser = await userModel.findUserById(user.id);

            res.json({
                message: 'Login successful',
                token,
                user: fullUser
            });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Verify token
    router.get('/verify', authenticateToken, async (req, res) => {
        try {
            const user = await userModel.findUserById(req.userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json({ user });
        } catch (error) {
            console.error('Verify token error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    return router;
}

module.exports = createAuthRoutes;
