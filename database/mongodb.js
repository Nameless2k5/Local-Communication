const mongoose = require('mongoose');

/**
 * MongoDB Connection Manager
 */
class MongoDBConnection {
    constructor() {
        this.connection = null;
    }

    /**
     * Connect to MongoDB
     * @param {string} uri - MongoDB connection URI
     */
    async connect(uri) {
        try {
            this.connection = await mongoose.connect(uri, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });

            console.log('✓ MongoDB connected successfully');
            console.log(`📊 Database: ${this.connection.connection.name}`);

            // Handle connection events
            mongoose.connection.on('error', (err) => {
                console.error('MongoDB connection error:', err);
            });

            mongoose.connection.on('disconnected', () => {
                console.log('MongoDB disconnected');
            });

            return this.connection;
        } catch (error) {
            console.error('❌ MongoDB connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Disconnect from MongoDB
     */
    async disconnect() {
        if (this.connection) {
            await mongoose.disconnect();
            console.log('✓ MongoDB disconnected');
        }
    }

    /**
     * Get connection instance
     */
    getConnection() {
        return this.connection;
    }
}

module.exports = new MongoDBConnection();
