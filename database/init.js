// In-memory database implementation for development
class InMemoryDatabase {
  constructor() {
    this.users = [];
    this.messages = [];
    this.nextUserId = 1;
    this.nextMessageId = 1;
  }

  // User methods
  createUser(username, email, passwordHash) {
    const user = {
      id: this.nextUserId++,
      username,
      email,
      password_hash: passwordHash,
      created_at: new Date().toISOString()
    };
    this.users.push(user);
    return user;
  }

  findUserByUsername(username) {
    return this.users.find(u => u.username === username);
  }

  findUserByEmail(email) {
    return this.users.find(u => u.email === email);
  }

  findUserById(id) {
    return this.users.find(u => u.id === id);
  }

  getAllUsers(excludeId = 0) {
    return this.users
      .filter(u => u.id !== excludeId)
      .map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        created_at: u.created_at
      }));
  }

  // Message methods
  createMessage(senderId, receiverId, content) {
    const message = {
      id: this.nextMessageId++,
      sender_id: senderId,
      receiver_id: receiverId,
      content,
      timestamp: new Date().toISOString(),
      read_status: 0
    };
    this.messages.push(message);
    return message;
  }

  getConversation(userId1, userId2, limit = 50) {
    const messages = this.messages
      .filter(m =>
        (m.sender_id === userId1 && m.receiver_id === userId2) ||
        (m.sender_id === userId2 && m.receiver_id === userId1)
      )
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-limit);

    return messages.map(m => {
      const sender = this.findUserById(m.sender_id);
      const receiver = this.findUserById(m.receiver_id);
      return {
        ...m,
        sender_username: sender?.username,
        receiver_username: receiver?.username
      };
    });
  }

  markAsRead(senderId, receiverId) {
    this.messages.forEach(m => {
      if (m.sender_id === senderId && m.receiver_id === receiverId && m.read_status === 0) {
        m.read_status = 1;
      }
    });
  }

  getUnreadCount(userId) {
    return this.messages.filter(m => m.receiver_id === userId && m.read_status === 0).length;
  }

  getUnreadBySender(receiverId) {
    const unreadBySender = {};
    this.messages
      .filter(m => m.receiver_id === receiverId && m.read_status === 0)
      .forEach(m => {
        if (!unreadBySender[m.sender_id]) {
          unreadBySender[m.sender_id] = 0;
        }
        unreadBySender[m.sender_id]++;
      });

    return Object.entries(unreadBySender).map(([senderId, count]) => ({
      sender_id: parseInt(senderId),
      count
    }));
  }
}

function initializeDatabase() {
  console.log('✓ In-memory database initialized');
  return new InMemoryDatabase();
}

module.exports = { initializeDatabase };
