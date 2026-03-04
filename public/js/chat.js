// Chat module - handles real-time messaging
import { API_BASE_URL, SOCKET_URL } from './config.js';
import { renderUserList, renderGroupList, renderMessage, getInitials, formatTime } from './components/ui.js';

class Chat {
    constructor(user, token, profileManager) {
        this.user = user;
        this.token = token;
        this.profileManager = profileManager;
        this.socket = null;
        this.currentChatUser = null;
        this.users = [];
        this.groups = [];
        this.onlineUserIds = [];
        this.typingTimeout = null;
        this.currentReplyTo = null;
        this.currentEditMessage = null;
        this.isActive = true;

        this.init();

    }

    async init() {
        // Connect to Socket.IO
        this.connectSocket();

        // Load users and groups
        await this.loadUsers();
        await this.loadGroups();

        // Setup event listeners
        this.setupEventListeners();

        // Init Right Sidebar
        this.initRightSidebar();

        // Xin quyền Notification
        this.requestNotificationPermission();
    }

    clearCurrentChatUI() {
        this.currentChatUser = null;
        document.getElementById('chat-active').classList.add('hidden');
        document.getElementById('chat-empty').classList.remove('hidden');
        const sidebarRight = document.getElementById('chat-sidebar-right');
        if (sidebarRight) {
            sidebarRight.classList.add('hidden');
        }
    }

    requestNotificationPermission() {
        if (!("Notification" in window)) {
            console.log("Trình duyệt không hỗ trợ Desktop Notification");
        } else if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }

    showNotification(message) {
        if (Notification.permission === "granted" && (document.hidden || !document.hasFocus())) {
            // Không thông báo tin nhắn của chính mình
            if (message.sender_id === this.user.id) return;

            const title = message.group_id
                ? (message.group_name || 'Tin nhắn nhóm mới')
                : (message.sender?.nickname || message.sender?.username || 'Tin nhắn mới');

            const options = {
                body: message.content,
                icon: message.sender?.avatar_url || '/favicon.ico',
                tag: message.group_id ? `group-${message.group_id}` : `user-${message.sender_id}`
            };

            const notification = new Notification(title, options);
            notification.onclick = function () {
                window.focus();
                this.close();
            };
        }
    }

    connectSocket() {
        this.socket = io(SOCKET_URL, {
            forceNew: true, // Ép tạo connection mới thay vì cache manager cũ
            auth: {
                token: this.token
            }
        });

        this.socket.on('connect', () => {
            console.log('✓ Connected to server');
        });

        this.socket.on('disconnect', () => {
            console.log('✗ Disconnected from server');
        });

        this.socket.on('users_online', (userIds) => {
            this.onlineUserIds = userIds;
            this.updateOnlineStatus();
        });

        this.socket.on('receive_message', (message) => {
            this.onMessageReceived(message);
        });

        this.socket.on('message_sent', (message) => {
            this.onMessageSent(message);
        });

        this.socket.on('user_typing', (data) => {
            if (this.currentChatUser && (data.userId === this.currentChatUser.id || data.groupId === this.currentChatUser.id)) {
                this.showTypingIndicator(data.groupId ? data.username : '');
            }
        });

        this.socket.on('user_stop_typing', (data) => {
            if (this.currentChatUser && (data.userId === this.currentChatUser.id || data.groupId === this.currentChatUser.id)) {
                this.hideTypingIndicator();
            }
        });

        this.socket.on('message_reaction_update', (data) => {
            this.handleReactionUpdate(data);
        });

        this.socket.on('messages_read', (data) => {
            this.handleMessagesRead(data);
        });

        this.socket.on('message_edited', (data) => {
            this.handleMessageEdited(data);
        });

        this.socket.on('message_deleted', (data) => {
            this.handleMessageDeleted(data);
        });

        this.socket.on('refresh_pinned', () => {
            this.loadPinnedMessages();
        });

        this.socket.on('group_created', (group) => {
            if (!this.groups.find(g => g._id === group._id)) {
                this.groups.unshift(group);
                this.renderUsers();
            }
        });

        this.socket.on('notify_join_group', (data) => {
            if (data.members.includes(this.user.id)) {
                this.socket.emit('join_room', data.groupId);
            }
        });

        this.socket.on('group_member_kicked', (data) => {
            const { groupId, targetId } = data;

            // Cập nhật local state
            const groupIndex = this.groups.findIndex(g => g._id === groupId);
            if (groupIndex !== -1) {
                this.groups[groupIndex].members = this.groups[groupIndex].members.filter(m => m._id !== targetId);
            }

            // Nếu người bị đá chính là mình
            if (this.user.id === targetId) {
                this.socket.emit('leave_room', groupId);
                this.groups = this.groups.filter(g => g._id !== groupId);
                if (this.currentChatUser && this.currentChatUser.id === groupId) {
                    this.clearCurrentChatUI();
                }
                this.renderUsers();
            } else if (this.currentChatUser && this.currentChatUser.id === groupId) {
                // Cập nhật UI nếu đang mở chat group
                this.currentChatUser.members = this.currentChatUser.members.filter(m => m._id !== targetId);
                this.renderGroupMembers();
            }
        });

        this.socket.on('group_deleted', (data) => {
            const { groupId } = data;

            this.groups = this.groups.filter(g => g._id !== groupId);
            this.socket.emit('leave_room', groupId);

            if (this.currentChatUser && this.currentChatUser.id === groupId) {
                this.clearCurrentChatUI();
            }
            this.renderUsers();
        });

        this.socket.on('group_updated', (updatedGroup) => {
            // Update in cache list
            const index = this.groups.findIndex(g => g._id === updatedGroup._id);
            if (index > -1) {
                this.groups[index] = updatedGroup;
            }

            this.renderUsers(); // Tối ưu: Render lại panel bên trái

            // Nếu người dùng đang MỞ cái Group đó trên màn hình thì tự refresh Name Avatar
            if (this.currentChatUser && this.currentChatUser.id === updatedGroup._id) {
                this.currentChatUser.username = updatedGroup.name;
                this.currentChatUser.nickname = updatedGroup.name;
                this.currentChatUser.avatar_url = updatedGroup.avatar_url;

                // Re-render Main Chat Header
                const chatUsername = document.getElementById('chat-username');
                const chatAvatar = document.getElementById('chat-user-avatar');
                if (chatUsername) chatUsername.textContent = updatedGroup.name;
                if (chatAvatar) {
                    if (updatedGroup.avatar_url) {
                        chatAvatar.style.backgroundImage = `url(${updatedGroup.avatar_url})`;
                        chatAvatar.style.backgroundSize = 'cover';
                        chatAvatar.textContent = '';
                    } else {
                        chatAvatar.style.backgroundImage = '';
                        chatAvatar.textContent = getInitials(updatedGroup.name);
                    }
                }

                // Refresh Top sidebar if opened
                const sidebarRight = document.getElementById('chat-sidebar-right');
                if (sidebarRight && !sidebarRight.classList.contains('hidden')) {
                    this.updateRightSidebarData();
                }
            }
        });

        this.socket.on('user_updated', (updatedUser) => {
            // Update user in users list
            const userIndex = this.users.findIndex(u => u.id === updatedUser.id);
            if (userIndex !== -1) {
                this.users[userIndex] = { ...this.users[userIndex], ...updatedUser };
                this.renderUsers();
            } else {
                // If user not found (e.g. new user or list incomplete), reload all
                this.loadUsers();
            }

            // Update current chat header if active
            if (this.currentChatUser && this.currentChatUser.id === updatedUser.id) {
                this.currentChatUser = { ...this.currentChatUser, ...updatedUser };

                const chatUsername = document.getElementById('chat-username');
                const chatAvatar = document.getElementById('chat-user-avatar');

                if (updatedUser.nickname || updatedUser.username) {
                    chatUsername.textContent = updatedUser.nickname || updatedUser.username;
                }

                if (updatedUser.avatar_url !== undefined) {
                    if (updatedUser.avatar_url) {
                        chatAvatar.style.backgroundImage = `url(${updatedUser.avatar_url})`;
                        chatAvatar.style.backgroundSize = 'cover';
                        chatAvatar.textContent = '';
                    } else {
                        chatAvatar.style.backgroundImage = '';
                        chatAvatar.textContent = getInitials(updatedUser.username || this.currentChatUser.username);
                    }
                }
            }
        });

        this.socket.on('chat_background_updated', (data) => {
            // data = { partnerId: userId_who_changed_it, backgroundUrl: ... }
            // If we are currently chatting with this partner, apply the background
            if (this.currentChatUser && this.currentChatUser.id === data.partnerId) {
                if (this.profileManager) {
                    this.profileManager.applyBackground(data.backgroundUrl);
                }
            }
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
    }

    async loadUsers() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/users`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.users = data.users;
                this.renderUsers();
            }
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    }

    async loadGroups() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/groups`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.groups = await response.json();
                this.renderUsers();
            }
        } catch (error) {
            console.error('Failed to load groups:', error);
        }
    }

    renderUsers() {
        const userList = document.getElementById('user-list');
        userList.innerHTML = '';

        if (this.users.length === 0 && this.groups.length === 0) {
            userList.innerHTML = '<p style="text-align: center; color: var(--text-tertiary); padding: 20px;">Chưa có hội thoại nào</p>';
            return;
        }

        // Gộp chung 2 mảng để sắp xếp
        const allConversations = [
            ...this.groups.map((g, index) => ({ ...g, id: g._id || g.id, isGroup: true, initialOrder: index })),
            ...this.users.map((u, index) => ({ ...u, isGroup: false, initialOrder: this.groups.length + index }))
        ];

        // Ưu tiên xếp theo Timestamp (Gần nhất -> Xa nhất). Nếu ko có timestamp thì giữ nguyên vị trí cũ.
        allConversations.sort((a, b) => {
            const timeA = a.lastActivity || 0;
            const timeB = b.lastActivity || 0;
            if (timeA !== timeB) return timeB - timeA;
            return a.initialOrder - b.initialOrder;
        });

        allConversations.forEach(item => {
            if (item.isGroup) {
                const groupEl = renderGroupList(item, this.currentChatUser?.id === item.id);
                groupEl.addEventListener('click', () => {
                    this.openChat({ ...item, username: item.name });
                });
                userList.appendChild(groupEl);
            } else {
                const isOnline = this.onlineUserIds.includes(item.id);
                const userEl = renderUserList(item, isOnline, this.currentChatUser?.id === item.id);
                userEl.addEventListener('click', () => {
                    this.openChat({ ...item });
                });
                userList.appendChild(userEl);
            }
        });
    }

    bumpConversation(id, isGroup) {
        const timestamp = Date.now();
        if (isGroup) {
            const group = this.groups.find(g => g._id === id || g.id === id);
            if (group) group.lastActivity = timestamp;
        } else {
            const user = this.users.find(u => u.id === id);
            if (user) user.lastActivity = timestamp;
        }
        this.renderUsers();
    }

    updateOnlineStatus() {
        this.renderUsers();
        if (this.currentChatUser) {
            this.updateSidebarStatus(this.currentChatUser);
        }
    }

    updateSidebarStatus(user) {
        const statusEl = document.getElementById('sidebar-status');
        if (statusEl) {
            const isOnline = this.onlineUserIds.includes(user.id);
            statusEl.textContent = isOnline ? 'Đang hoạt động' : 'Offline';
            statusEl.className = isOnline ? 'status-active' : 'status-offline';
            statusEl.style.color = isOnline ? 'var(--success-color)' : 'var(--text-tertiary)';
        }
    }

    async openChat(user) {
        this.currentChatUser = user;

        // Set current partner in profile manager for background settings
        if (this.profileManager) {
            this.profileManager.setCurrentPartner(user.id);
            this.profileManager.loadChatBackground(user.id);
        }

        // Update UI
        document.getElementById('chat-empty').classList.add('hidden');
        document.getElementById('chat-active').classList.remove('hidden');

        const chatUsername = document.getElementById('chat-username');
        const chatAvatar = document.getElementById('chat-user-avatar');

        chatUsername.textContent = user.username;

        // Hide/Show WebRTC Call buttons depending on chat type (1-1 or Group)
        const callAudioBtn = document.getElementById('call-audio-btn');
        const callVideoBtn = document.getElementById('call-video-btn');
        if (user.isGroup) {
            if (callAudioBtn) callAudioBtn.classList.add('hidden');
            if (callVideoBtn) callVideoBtn.classList.add('hidden');
        } else {
            if (callAudioBtn) callAudioBtn.classList.remove('hidden');
            if (callVideoBtn) callVideoBtn.classList.remove('hidden');
        }

        if (user.avatar_url) {
            chatAvatar.style.backgroundImage = `url(${user.avatar_url})`;
            chatAvatar.style.backgroundSize = 'cover';
            chatAvatar.textContent = '';
        } else {
            chatAvatar.style.backgroundImage = '';
            chatAvatar.textContent = getInitials(user.username);
        }

        // Update right sidebar status
        this.updateSidebarStatus(user);

        // Update Right Sidebar layout auto-refresh if already opened
        const sidebarRight = document.getElementById('chat-sidebar-right');
        if (sidebarRight && !sidebarRight.classList.contains('hidden')) {
            this.updateRightSidebarData();
        }

        // Update active state in user list
        this.renderUsers();

        // Load conversation
        await this.loadConversation(user.id);

        // Focus message input
        document.getElementById('message-input').focus();

        // Mobile: show chat, hide sidebar
        const chatMain = document.querySelector('.chat-main');
        const sidebar = document.querySelector('.sidebar');

        if (window.innerWidth <= 768) {
            chatMain.classList.add('active');
            sidebar.classList.add('hidden-mobile');
        }

        // Hide mobile sidebar overlay if visible
        this.hideMobileSidebar();
    }

    async loadConversation(userId) {
        try {
            const isGroup = this.currentChatUser && this.currentChatUser.isGroup;
            const endpoint = isGroup
                ? `${API_BASE_URL}/api/groups/${userId}/messages`
                : `${API_BASE_URL}/api/messages/${userId}`;

            const response = await fetch(endpoint, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderMessages(data.messages);
            }
        } catch (error) {
            console.error('Failed to load conversation:', error);
        }
    }

    renderMessages(messages) {

        const container = document.getElementById('messages-container');
        container.innerHTML = '';

        const isGroupChat = this.currentChatUser && this.currentChatUser.isGroup;
        const currentTargetId = this.currentChatUser ? this.currentChatUser.id : null;
        const unreadIds = [];

        messages.forEach(message => {
            const isSent = message.sender_id === this.user.id;
            // Map created_at to timestamp for UI compatibility
            message.timestamp = message.created_at;
            const messageEl = renderMessage(message, isSent, isGroupChat);
            container.appendChild(messageEl);

            if (!isSent) {
                let isAlreadyRead = false;
                if (isGroupChat) {
                    isAlreadyRead = message.read_by && message.read_by.some(r => r.user_id === this.user.id);
                } else {
                    isAlreadyRead = message.read;
                }
                if (!isAlreadyRead) {
                    unreadIds.push(message.id || message._id);
                }
            }
        });

        if (unreadIds.length > 0 && currentTargetId) {
            const payload = {
                messageIds: unreadIds,
                isGroup: isGroupChat
            };
            if (isGroupChat) {
                payload.groupId = currentTargetId;
            } else {
                payload.senderId = currentTargetId;
            }
            this.socket.emit('mark_messages_read', payload);
        }

        // Scroll to bottom
        this.scrollToBottom();
    }

    setupEventListeners() {
        const messageForm = document.getElementById('message-form');
        const messageInput = document.getElementById('message-input');

        messageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!this.isActive) return;
            this.sendMessage();
        });

        // Typing indicator
        messageInput.addEventListener('input', () => {
            if (!this.isActive) return;
            if (this.currentChatUser) {
                const isGroup = this.currentChatUser.isGroup;
                const payload = isGroup ? { groupId: this.currentChatUser.id } : { receiverId: this.currentChatUser.id };

                this.socket.emit('typing', payload);

                clearTimeout(this.typingTimeout);
                this.typingTimeout = setTimeout(() => {
                    this.socket.emit('stop_typing', payload);
                }, 2000);
            }
        });

        // Search users
        document.getElementById('search-users').addEventListener('input', (e) => {
            this.searchUsers(e.target.value);
        });

        // Mobile menu toggle
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileMenuBtnEmpty = document.getElementById('mobile-menu-btn-empty');
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                this.toggleMobileSidebar();
            });
        }

        if (mobileMenuBtnEmpty) {
            mobileMenuBtnEmpty.addEventListener('click', () => {
                this.toggleMobileSidebar();
            });
        }

        if (overlay) {
            overlay.addEventListener('click', () => {
                this.hideMobileSidebar();
            });
        }

        // File attachment handlers
        const attachBtn = document.getElementById('attach-btn');
        const fileInput = document.getElementById('file-input');
        const cancelUploadBtn = document.getElementById('cancel-upload');

        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                if (!this.isActive) return;
                const files = e.target.files;
                if (files && files.length > 0) {
                    await this.handleFileSelection(files);
                }
            });
        }

        if (cancelUploadBtn) {
            cancelUploadBtn.addEventListener('click', () => {
                this.clearFilePreview();
            });
        }

        // Pin Message Handler
        document.addEventListener('pin-message', (e) => {
            if (e.detail && e.detail.messageId) {
                this.togglePinMessage(e.detail.messageId);
            }
        });

        // Forward Message Handlers
        const submitForwardBtn = document.getElementById('send-forward-btn');
        if (submitForwardBtn) {
            submitForwardBtn.addEventListener('click', () => {
                this.submitForwardMessage();
            });
        }

        const searchForwardInput = document.getElementById('search-forward-targets');
        if (searchForwardInput) {
            searchForwardInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const labels = document.querySelectorAll('#forward-targets-list .member-item');
                labels.forEach(label => {
                    const text = label.textContent.toLowerCase();
                    label.style.display = text.includes(term) ? 'flex' : 'none';
                });
            });
        }

        // Reaction Handler
        document.addEventListener('message-reaction', (e) => {
            if (e.detail && e.detail.messageId && e.detail.type) {
                this.toggleReaction(e.detail.messageId, e.detail.type);
            }
        });

        // Reply Handler
        document.addEventListener('reply-message', (e) => {
            if (!this.isActive) return;
            if (e.detail) {
                this.setReplyTarget(e.detail);
            }
        });

        // Edit Handler
        document.addEventListener('edit-message-inline', (e) => {
            if (!this.isActive) return;
            if (e.detail && e.detail.messageId && e.detail.content) {
                this.saveInlineEdit(e.detail.messageId, e.detail.content);
            }
        });

        // Delete Handler
        document.addEventListener('delete-message', (e) => {
            if (!this.isActive) return;
            if (e.detail && e.detail.messageId) {
                this.deleteMessage(e.detail.messageId);
            }
        });

        const cancelReplyBtn = document.getElementById('cancel-reply');
        if (cancelReplyBtn) {
            cancelReplyBtn.addEventListener('click', () => {
                this.clearReplyTarget();
            });
        }

        // Search Handlers
        const toggleSearchBtn = document.getElementById('toggle-search-btn');
        const searchContainer = document.getElementById('chat-search-container');
        const closeSearchBtn = document.getElementById('chat-search-close');
        const searchInput = document.getElementById('chat-search-input');
        const searchBtn = document.getElementById('chat-search-btn');
        const searchPrevBtn = document.getElementById('search-prev-btn');
        const searchNextBtn = document.getElementById('search-next-btn');

        this.searchResults = [];
        this.currentSearchIndex = -1;

        if (toggleSearchBtn) {
            toggleSearchBtn.addEventListener('click', () => {
                searchContainer.classList.remove('hidden');
                searchInput.focus();
            });
        }

        if (closeSearchBtn) {
            closeSearchBtn.addEventListener('click', () => {
                searchContainer.classList.add('hidden');
                searchInput.value = '';
                this.clearSearchHighlights();
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.performSearch(searchInput.value);
            });
        }

        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(searchInput.value);
                }
            });
        }

        if (searchPrevBtn) {
            searchPrevBtn.addEventListener('click', () => this.navigateSearch(-1));
        }

        if (searchNextBtn) {
            searchNextBtn.addEventListener('click', () => this.navigateSearch(1));
        }

        // Create Group Handlers
        const createGroupBtn = document.getElementById('create-group-btn');
        const createGroupModal = document.getElementById('create-group-modal');
        const submitCreateGroupBtn = document.getElementById('submit-create-group-btn');

        if (createGroupBtn && createGroupModal) {
            createGroupBtn.addEventListener('click', () => {
                const membersList = document.getElementById('group-members-list');
                membersList.innerHTML = '';

                // Populate checkboxes for available users
                this.users.forEach(user => {
                    if (user.id !== this.user.id) {
                        const label = document.createElement('label');
                        label.className = 'user-item';
                        label.style.display = 'flex';
                        label.style.alignItems = 'center';

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.value = user.id;
                        checkbox.className = 'group-member-checkbox';

                        const span = document.createElement('span');
                        span.textContent = user.username + (user.nickname ? ` (${user.nickname})` : '');

                        label.appendChild(checkbox);
                        label.appendChild(span);
                        membersList.appendChild(label);
                    }
                });

                document.getElementById('group-name').value = '';
                document.getElementById('create-group-error').classList.add('hidden');
                createGroupModal.classList.remove('hidden');
            });
        }

        if (submitCreateGroupBtn) {
            submitCreateGroupBtn.addEventListener('click', async () => {
                if (!this.isActive) return;
                const name = document.getElementById('group-name').value.trim();
                const checkboxes = document.querySelectorAll('.group-member-checkbox:checked');
                const selectedMembers = Array.from(checkboxes).map(cb => cb.value);

                if (!name) {
                    const errorEl = document.getElementById('create-group-error');
                    errorEl.textContent = 'Vui lòng nhập tên nhóm';
                    errorEl.classList.remove('hidden');
                    return;
                }

                if (selectedMembers.length === 0) {
                    const errorEl = document.getElementById('create-group-error');
                    errorEl.textContent = 'Vui lòng chọn ít nhất 1 thành viên';
                    errorEl.classList.remove('hidden');
                    return;
                }

                try {
                    submitCreateGroupBtn.disabled = true;
                    submitCreateGroupBtn.textContent = 'Đang xử lý...';

                    const response = await fetch(`${API_BASE_URL}/api/groups`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify({
                            name,
                            members: selectedMembers
                        })
                    });

                    if (response.ok) {
                        const newGroup = await response.json();
                        createGroupModal.classList.add('hidden');

                        // Render immediately for the creator
                        if (!this.groups.find(g => g._id === newGroup._id)) {
                            this.groups.unshift(newGroup);
                            this.renderUsers();
                        }
                    } else {
                        const data = await response.json();
                        throw new Error(data.error || 'Failed to create group');
                    }
                } catch (error) {
                    const errorEl = document.getElementById('create-group-error');
                    errorEl.textContent = error.message;
                    errorEl.classList.remove('hidden');
                } finally {
                    submitCreateGroupBtn.disabled = false;
                    submitCreateGroupBtn.textContent = 'Tạo Nhóm';
                }
            });
        }

        // --- ADD MEMBERS MODAL ---
        const addMembersModal = document.getElementById('add-members-modal');
        const addMemberBtn = document.getElementById('add-member-btn');
        const submitAddMembersBtn = document.getElementById('submit-add-members-btn');

        if (addMemberBtn) {
            addMemberBtn.addEventListener('click', () => {
                if (!this.currentChatUser || !this.currentChatUser.isGroup) return;

                const membersList = document.getElementById('add-members-selection-list');
                membersList.innerHTML = '';

                // Render contacts exclude existing members
                const existingMemberIds = this.currentChatUser.members.map(m => m._id || m);

                this.users.forEach(u => {
                    if (u.id !== this.user.id && !existingMemberIds.includes(u.id)) {
                        const label = document.createElement('label');
                        label.className = 'user-selection-item';

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.className = 'add-member-checkbox';
                        checkbox.value = u.id;

                        const span = document.createElement('span');
                        span.textContent = u.nickname || u.username;

                        label.appendChild(checkbox);
                        label.appendChild(span);
                        membersList.appendChild(label);
                    }
                });

                if (membersList.children.length === 0) {
                    membersList.innerHTML = '<p class="empty-text">Không có bạn bè nào để thêm.</p>';
                }

                document.getElementById('add-members-error').classList.add('hidden');
                addMembersModal.classList.remove('hidden');
            });
        }

        if (submitAddMembersBtn) {
            submitAddMembersBtn.addEventListener('click', async () => {
                if (!this.isActive) return;
                const checkboxes = document.querySelectorAll('.add-member-checkbox:checked');
                const targetIds = Array.from(checkboxes).map(cb => cb.value);

                if (targetIds.length === 0) {
                    const errorEl = document.getElementById('add-members-error');
                    errorEl.textContent = 'Vui lòng chọn ít nhất 1 thành viên';
                    errorEl.classList.remove('hidden');
                    return;
                }

                try {
                    submitAddMembersBtn.disabled = true;
                    submitAddMembersBtn.textContent = 'Đang xử lý...';

                    const groupId = this.currentChatUser._id || this.currentChatUser.id;
                    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/members`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify({ targetIds })
                    });

                    if (response.ok) {
                        // Will update via Socket group_updated globally
                        addMembersModal.classList.add('hidden');
                    } else {
                        const data = await response.json();
                        throw new Error(data.error || 'Failed to add members');
                    }
                } catch (error) {
                    const errorEl = document.getElementById('add-members-error');
                    errorEl.textContent = error.message;
                    errorEl.classList.remove('hidden');
                } finally {
                    submitAddMembersBtn.disabled = false;
                    submitAddMembersBtn.textContent = 'Thêm';
                }
            });
        }

        // --- DELETE GROUP ---
        const deleteGroupBtn = document.getElementById('delete-group-btn');
        if (deleteGroupBtn) {
            deleteGroupBtn.addEventListener('click', async () => {
                if (!this.isActive) return;
                if (!this.currentChatUser || !this.currentChatUser.isGroup) return;

                if (!confirm(`Cảnh báo: Bạn có chắc chắn muốn TÚC TẮC XOÁ toàn bộ nhóm và tin nhắn của nhóm ${this.currentChatUser.name} không?`)) {
                    return;
                }

                try {
                    const groupId = this.currentChatUser._id || this.currentChatUser.id;
                    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${this.token}`
                        }
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.error || 'Failed to delete group');
                    }

                    // Đóng giao diện chat và sidebar
                    this.clearCurrentChatUI();
                } catch (e) {
                    alert(e.message);
                }
            });
        }

        // --- LEAVE GROUP ---
        const leaveGroupBtn = document.getElementById('leave-group-btn');
        if (leaveGroupBtn) {
            leaveGroupBtn.addEventListener('click', async () => {
                if (!this.isActive) return;
                if (!this.currentChatUser || !this.currentChatUser.isGroup) return;

                if (!confirm(`Bạn có chắc chắn muốn rời khỏi nhóm ${this.currentChatUser.name} không?`)) {
                    return;
                }

                try {
                    const groupId = this.currentChatUser._id || this.currentChatUser.id;
                    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/leave`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.token}`
                        }
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.error || 'Failed to leave group');
                    }

                    // Client sẽ được tự động refresh qua Socket Event group_member_kicked trả ngược từ server về chính mình
                } catch (e) {
                    alert(e.message);
                }
            });
        }

        // Edit Group Event
        const editGroupModal = document.getElementById('edit-group-modal');
        const editGroupBtn = document.getElementById('edit-group-info-btn');
        const editGroupNameInput = document.getElementById('edit-group-name');
        const editGroupForm = document.getElementById('edit-group-form');
        const editGroupAvatarInput = document.getElementById('edit-group-avatar');
        const editGroupAvatarPreview = document.getElementById('edit-group-avatar-preview');

        if (editGroupBtn && editGroupModal) {
            editGroupBtn.addEventListener('click', () => {
                if (!this.currentChatUser || !this.currentChatUser.isGroup) return;

                // Pre-fill dữ liệu cũ
                editGroupNameInput.value = this.currentChatUser.nickname || this.currentChatUser.username;
                if (this.currentChatUser.avatar_url) {
                    editGroupAvatarPreview.style.backgroundImage = `url(${this.currentChatUser.avatar_url})`;
                    editGroupAvatarPreview.textContent = '';
                } else {
                    editGroupAvatarPreview.style.backgroundImage = '';
                    editGroupAvatarPreview.textContent = getInitials(this.currentChatUser.username || '?');
                }

                editGroupModal.classList.remove('hidden');
            });
        }

        // Close Edit Group Modal
        document.querySelectorAll('.close-modal[data-modal="edit-group-modal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (editGroupModal) editGroupModal.classList.add('hidden');
            });
        });

        if (editGroupAvatarInput && editGroupAvatarPreview) {
            editGroupAvatarInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    alert('❌ Vui lòng chọn file ảnh!');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (e) => {
                    if (window.app && window.app.profileManager) {
                        window.app.profileManager.openCropModal(e.target.result, 'group');
                    } else {
                        console.error("Lỗi: Không tìm thấy trình điều khiển ProfileManager để bật Cắt Ảnh.");
                    }
                };
                reader.readAsDataURL(file);
                e.target.value = ''; // Reset
            });
        }

        if (editGroupForm) {
            editGroupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!this.isActive) return;
                const newName = editGroupNameInput.value;
                const file = editGroupAvatarInput.files[0];

                try {
                    const groupId = this.currentChatUser.id;
                    // Gọi API update tên
                    if (newName !== (this.currentChatUser.nickname || this.currentChatUser.username)) {
                        await fetch(`${API_BASE_URL}/api/groups/${groupId}/info`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
                            body: JSON.stringify({ name: newName })
                        });
                    }

                    // Logic Đổi API ảnh sẽ được rời sang lúc bấm Cắt sau khi chọn File. Tại Submit này chỉ gửi sửa Tên.

                    alert('Đã cập nhật thông tin nhóm!');
                    editGroupModal.classList.add('hidden');
                } catch (err) {
                    console.error('Lỗi khi update group info', err);
                    alert('Có lỗi xảy ra, vui lòng thử lại sau.');
                }
            });
        }
    }

    toggleMobileSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const chatMain = document.querySelector('.chat-main');

        // If we're in active chat, show sidebar as overlay
        if (chatMain.classList.contains('active')) {
            sidebar.classList.toggle('mobile-visible');
            overlay.classList.toggle('visible');
        }
    }

    // ... (existing code) ...

    async toggleReaction(messageId, type) {
        if (this.currentChatUser) {
            this.socket.emit('message_reaction', {
                messageId,
                receiverId: this.currentChatUser.id,
                type
            });
        } else {
            console.warn('No currentChatUser, cannot react');
        }
    }

    handleReactionUpdate(data) {

        const { messageId, reactions } = data;
        const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
        if (msgEl) {
            const bubble = msgEl.querySelector('.message-bubble');
            let reactionsContainer = bubble.querySelector('.message-reactions');

            // If container doesn't exist (first reaction), create it
            if (!reactionsContainer && reactions.length > 0) {
                reactionsContainer = document.createElement('div');
                reactionsContainer.className = 'message-reactions';
                bubble.appendChild(reactionsContainer);
            }

            // If it exists, update it. If no reactions left, remove it.
            if (reactionsContainer) {
                if (reactions.length === 0) {
                    reactionsContainer.remove();
                } else {
                    this.updateReactionsDOM(reactionsContainer, reactions);
                }
            }
        } else {
            console.warn('Message element found for reaction update:', messageId);
        }
    }

    hideMobileSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        sidebar.classList.remove('mobile-visible');
        overlay.classList.remove('visible');
    }

    sendMessage() {
        if (!this.currentChatUser) return;
        if (this.isUploading) {
            alert('Vui lòng đợi file tải lên hoàn tất trước khi gửi.');
            return;
        }

        const input = document.getElementById('message-input');
        const content = input.value.trim();
        const isGroup = this.currentChatUser.isGroup;
        const targetPayload = isGroup
            ? { groupId: this.currentChatUser.id }
            : { receiverId: this.currentChatUser.id };

        // Include reply context if any
        if (this.currentReplyTo) {
            targetPayload.replyToId = this.currentReplyTo.messageId;
        }

        // Check if sending attached files or text
        if (this.pendingAttachments && this.pendingAttachments.length > 0) {
            // Send file messages individually
            this.pendingAttachments.forEach((attachment, index) => {
                const messagePayload = {
                    ...targetPayload,
                    message_type: attachment.message_type,
                    attachment: attachment
                };

                // Attach the typed text to the FIRST file bubble only
                if (index === 0 && content) {
                    messagePayload.content = content;
                } else {
                    messagePayload.content = attachment.filename; // Fallback to filename
                }

                this.socket.emit('send_message', messagePayload);
            });

            // Clear file preview and input
            this.clearFilePreview();
            this.clearReplyTarget();
            input.value = '';
        } else {
            // Send text message
            if (!content) return;

            this.socket.emit('send_message', {
                ...targetPayload,
                content,
                message_type: 'text'
            });

            this.clearReplyTarget();
            input.value = '';
        }

        // Stop typing indicator
        const typingPayload = isGroup ? { groupId: this.currentChatUser.id } : { receiverId: this.currentChatUser.id };
        this.socket.emit('stop_typing', typingPayload);
    }

    onMessageReceived(message) {
        // Check if message belongs to current chat
        const isGroupMsg = !!message.group_id;

        // Đẩy hội thoại lên đầu mảng
        const targetId = isGroupMsg ? message.group_id : message.sender_id;
        this.bumpConversation(targetId, isGroupMsg);

        const isCurrentGroupMsg = this.currentChatUser && this.currentChatUser.isGroup && this.currentChatUser.id === message.group_id;
        const isCurrentDirectMsg = this.currentChatUser && !this.currentChatUser.isGroup && message.sender_id === this.currentChatUser.id;

        if (isCurrentGroupMsg || isCurrentDirectMsg) {
            const container = document.getElementById('messages-container');
            message.timestamp = message.created_at;
            const messageEl = renderMessage(message, false, isGroupMsg);
            container.appendChild(messageEl);
            this.scrollToBottom();

            // Emit mark as read immediately
            const payload = {
                messageIds: [message.id || message._id],
                isGroup: isGroupMsg
            };
            if (isGroupMsg) {
                payload.groupId = message.group_id;
            } else {
                payload.senderId = message.sender_id;
            }
            this.socket.emit('mark_messages_read', payload);
        }

        // Hiển thị thông báo trình duyệt
        this.showNotification(message);
    }

    onMessageSent(message) {
        const isGroupMsg = !!message.group_id;

        // Đẩy hội thoại lên đầu mảng
        const targetId = isGroupMsg ? message.group_id : message.receiver_id;
        this.bumpConversation(targetId, isGroupMsg);

        const isCurrentGroupMsg = this.currentChatUser && this.currentChatUser.isGroup && this.currentChatUser.id === message.group_id;
        const isCurrentDirectMsg = this.currentChatUser && !this.currentChatUser.isGroup && message.receiver_id === this.currentChatUser.id;

        if (isCurrentGroupMsg || isCurrentDirectMsg) {
            const container = document.getElementById('messages-container');
            message.timestamp = message.created_at;
            const messageEl = renderMessage(message, true, isGroupMsg);
            container.appendChild(messageEl);
            this.scrollToBottom();
        }
    }

    showTypingIndicator(username = '') {
        const indicator = document.getElementById('typing-indicator');
        if (!indicator) return;

        const dotsHTML = '<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
        if (username) {
            indicator.innerHTML = `<strong>${username}</strong> đang nhập ${dotsHTML}`;
        } else {
            indicator.innerHTML = `đang nhập ${dotsHTML}`;
        }
        indicator.classList.remove('hidden');
    }

    hideTypingIndicator() {
        document.getElementById('typing-indicator').classList.add('hidden');
    }

    handleMessagesRead(data) {
        const { messageIds, userId, groupId } = data;
        const isGroup = !!groupId;

        messageIds.forEach(msgId => {
            const msgDiv = document.querySelector(`.message[data-id="${msgId}"]`);
            if (msgDiv && msgDiv.classList.contains('sent')) {
                const timeEl = msgDiv.querySelector('.message-time');
                let readReceiptEl = msgDiv.querySelector('.read-receipt');

                if (isGroup) {
                    if (!readReceiptEl) {
                        readReceiptEl = document.createElement('span');
                        readReceiptEl.className = 'read-receipt';
                        readReceiptEl.dataset.count = 1;
                        readReceiptEl.textContent = `Đã xem (1)`;
                        timeEl.appendChild(document.createTextNode(' • '));
                        timeEl.appendChild(readReceiptEl);
                    } else {
                        let count = parseInt(readReceiptEl.dataset.count || 1);
                        count++;
                        readReceiptEl.dataset.count = count;
                        readReceiptEl.textContent = `Đã xem (${count})`;
                    }
                } else {
                    if (!readReceiptEl) {
                        readReceiptEl = document.createElement('span');
                        readReceiptEl.className = 'read-receipt';
                        readReceiptEl.textContent = 'Đã xem';
                        timeEl.appendChild(document.createTextNode(' • '));
                        timeEl.appendChild(readReceiptEl);
                    }
                }
            }
        });
    }

    scrollToBottom() {
        const container = document.getElementById('messages-container');
        container.scrollTop = container.scrollHeight;
    }

    clearSearchHighlights() {
        const container = document.getElementById('messages-container');
        const highlights = container.querySelectorAll('.highlight-search');
        highlights.forEach(h => {
            const parent = h.parentNode;
            parent.replaceChild(document.createTextNode(h.textContent), h);
            parent.normalize();
        });
    }

    renderGroupMembers() {
        if (!this.currentChatUser || !this.currentChatUser.isGroup) return;
        const container = document.getElementById('sidebar-members-list');
        if (!container) return;

        container.innerHTML = '';
        const members = this.currentChatUser.members || [];
        const adminId = this.currentChatUser.admin_id?._id || this.currentChatUser.admin_id;
        const coAdmins = (this.currentChatUser.co_admins || []).map(c => c._id || c);

        const myId = this.user.id;
        const amIAdmin = adminId === myId;
        const amICoAdmin = coAdmins.includes(myId);

        // --- Xử lý ẩn/hiện các nút action thao tác tổng ---
        const groupActionsContainer = document.getElementById('group-actions');
        const addMemberBtn = document.getElementById('add-member-btn');
        const deleteGroupBtn = document.getElementById('delete-group-btn');
        const leaveGroupBtn = document.getElementById('leave-group-btn');
        const editGroupBtn = document.getElementById('edit-group-info-btn');

        if (groupActionsContainer) groupActionsContainer.classList.remove('hidden'); // Luôn hiển thị block chứa, và bật/tắt các nút con bên trong
        if (addMemberBtn) addMemberBtn.style.display = (amIAdmin || amICoAdmin) ? 'block' : 'none';
        if (editGroupBtn) editGroupBtn.style.display = (amIAdmin || amICoAdmin) ? 'block' : 'none';
        if (deleteGroupBtn) deleteGroupBtn.style.display = amIAdmin ? 'block' : 'none';
        if (leaveGroupBtn) leaveGroupBtn.style.display = !amIAdmin ? 'block' : 'none'; // Ai cũng rời được ngoại trừ Admin gốc

        members.forEach(member => {
            const memberId = member._id.toString();
            const isAdmin = adminId === memberId;
            const isCoAdmin = coAdmins.includes(memberId);
            const isMe = memberId === myId;

            let roleLabel = 'Thành viên';
            let roleClass = 'role-member';
            if (isAdmin) {
                roleLabel = 'Trưởng nhóm';
                roleClass = 'role-admin';
            } else if (isCoAdmin) {
                roleLabel = 'Phó nhóm';
                roleClass = 'role-co-admin';
            }

            const el = document.createElement('div');
            el.className = 'group-member-item';

            // Allow actions if I am Admin/CoAdmin AND target is not Admin/CoAdmin AND target is not me
            const canAction = (amIAdmin || amICoAdmin) && !isAdmin && !isCoAdmin && !isMe;

            let avatarHtml = member.avatar_url ? `<div class="avatar" style="background-image: url(${member.avatar_url}); background-size: cover"></div>` : `<div class="avatar">${getInitials(member.username)}</div>`;

            el.innerHTML = `
                ${avatarHtml}
                <div class="group-member-info">
                    <span class="group-member-name">${member.username} ${isMe ? '(Bạn)' : ''}</span>
                    <span class="member-role-badge ${roleClass}">${roleLabel}</span>
                </div>
                ${canAction ? `
                <div class="member-actions">
                    ${amIAdmin ? `<button class="member-action-btn promote-btn" title="Thăng cấp" data-id="${memberId}">⭐</button>` : ''}
                    <button class="member-action-btn kick-btn" title="Xóa" data-id="${memberId}">✕</button>
                </div>
                ` : ''}
            `;

            if (canAction) {
                const kickBtn = el.querySelector('.kick-btn');
                if (kickBtn) {
                    kickBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm(`Bạn có chắc muốn xoá ${member.username} khỏi nhóm?`)) {
                            this.kickMember(this.currentChatUser.id, memberId);
                        }
                    });
                }
                const promoteBtn = el.querySelector('.promote-btn');
                if (promoteBtn) {
                    promoteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm(`Chỉ định ${member.username} làm Phó nhóm?`)) {
                            this.promoteMember(this.currentChatUser.id, memberId);
                        }
                    });
                }
            }

            container.appendChild(el);
        });

        // Cập nhật text số lượng ở thanh header nếu cần
        const statusEl = document.getElementById('sidebar-status');
        if (statusEl) {
            statusEl.textContent = `${members.length} thành viên`;
            statusEl.className = 'status-active';
            statusEl.style.color = 'var(--text-tertiary)';
        }
    }

    async kickMember(groupId, targetId) {
        try {
            const resp = await fetch(`${API_BASE_URL}/api/groups/${groupId}/kick`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ targetId })
            });
            if (!resp.ok) {
                const data = await resp.json();
                alert(data.error || 'Lỗi khi kích!');
            }
        } catch (e) { console.error('Kick err', e); }
    }

    async promoteMember(groupId, targetId) {
        try {
            const resp = await fetch(`${API_BASE_URL}/api/groups/${groupId}/promote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ targetId })
            });
            if (!resp.ok) {
                const data = await resp.json();
                alert(data.error || 'Lỗi khi thăng cấp!');
            }
        } catch (e) { console.error('Promote err', e); }
    }

    searchUsers(query) {
        const userList = document.getElementById('user-list');
        const items = userList.querySelectorAll('.user-item');

        items.forEach(item => {
            const username = item.querySelector('h4').textContent.toLowerCase();
            if (username.includes(query.toLowerCase())) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // --- Message Editing & Deleting Features ---

    saveInlineEdit(messageId, newContent) {
        if (!this.currentChatUser || !newContent) return;
        const isGroup = this.currentChatUser.isGroup;
        const targetPayload = isGroup
            ? { groupId: this.currentChatUser.id }
            : { receiverId: this.currentChatUser.id };

        this.socket.emit('edit_message', {
            ...targetPayload,
            messageId: messageId,
            content: newContent
        });
    }

    deleteMessage(messageId) {
        if (!this.currentChatUser) return;
        const isGroup = this.currentChatUser.isGroup;
        const payload = {
            messageId: messageId,
        };

        if (isGroup) {
            payload.groupId = this.currentChatUser.id;
        } else {
            payload.receiverId = this.currentChatUser.id;
        }

        this.socket.emit('delete_message', payload);
    }

    handleMessageEdited(message) {
        const isGroupMsg = !!message.group_id;

        // Only update UI if we are in this chat
        const isCurrentGroupMsg = this.currentChatUser && this.currentChatUser.isGroup && this.currentChatUser.id === message.group_id;
        const isCurrentDirectMsg = this.currentChatUser && !this.currentChatUser.isGroup &&
            (message.receiver_id === this.currentChatUser.id || message.sender_id === this.currentChatUser.id);

        if (isCurrentGroupMsg || isCurrentDirectMsg) {
            const container = document.getElementById('messages-container');
            const targetMessageDOM = container.querySelector(`.message[data-id="${message.id}"]`);

            if (targetMessageDOM) {
                // We use renderMessage to completely fresh up the bubble
                message.timestamp = message.created_at;
                const isSent = message.sender_id === this.user.id;
                const newMessageDOM = renderMessage(message, isSent, isGroupMsg);
                container.replaceChild(newMessageDOM, targetMessageDOM);
            }
        }
    }

    handleMessageDeleted(data) {
        const { messageId, groupId, receiverId } = data;
        const isGroupMsg = !!groupId;

        const isCurrentGroupMsg = this.currentChatUser && this.currentChatUser.isGroup && this.currentChatUser.id === groupId;
        const isCurrentDirectMsg = this.currentChatUser && !this.currentChatUser.isGroup &&
            (receiverId === this.currentChatUser.id || receiverId === this.user.id);

        if (isCurrentGroupMsg || isCurrentDirectMsg) {
            const container = document.getElementById('messages-container');
            const targetMessageDOM = container.querySelector(`.message[data-id="${messageId}"]`);

            // Xoá file phương tiện ở Sidebar nếu có
            const sidebarMedia = document.querySelector(`.media-item[data-id="${messageId}"]`);
            if (sidebarMedia) sidebarMedia.remove();
            const sidebarFile = document.querySelector(`.file-item-sidebar[data-id="${messageId}"]`);
            if (sidebarFile) sidebarFile.remove();

            if (targetMessageDOM) {
                // Add deleted class & modify content gracefully
                targetMessageDOM.classList.add('deleted');
                const bubble = targetMessageDOM.querySelector('.message-bubble');
                if (bubble) {
                    // Remove old content completely (images, files, quoted texts, forward tags)
                    const oldContent = bubble.querySelectorAll('.message-content, .message-image, .message-video, .message-file, .quoted-message, .message-forward-tag');
                    oldContent.forEach(el => el.remove());

                    // Add deleted message placeholder
                    const contentDOM = document.createElement('div');
                    contentDOM.className = 'message-content italic text-muted';
                    contentDOM.textContent = 'Tin nhắn đã thu hồi';
                    contentDOM.style.fontStyle = 'italic';
                    contentDOM.style.color = 'var(--text-tertiary)';

                    // Insert at the beginning of bubble (before time/reactions)
                    bubble.insertBefore(contentDOM, bubble.firstChild);

                    // Remove actions menu
                    const actionsDOM = bubble.querySelector('.message-actions');
                    if (actionsDOM) {
                        actionsDOM.remove();
                    }
                }
            }
        }
    }

    async handleFileSelection(files) {
        if (!this.currentChatUser) {
            alert('Vui lòng chọn người nhận trước');
            this.clearFileInput();
            return;
        }

        if (files.length > 10) {
            alert('Bạn chỉ có thể gửi tối đa 10 file một lần');
            this.clearFileInput();
            return;
        }

        const maxSizes = {
            image: 5 * 1024 * 1024,   // 5MB
            video: 50 * 1024 * 1024,  // 50MB
            file: 10 * 1024 * 1024    // 10MB
        };

        // Validate all files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileType = this.getFileType(file.type || '');
            if (file.size > maxSizes[fileType]) {
                alert(`File ${file.name} quá lớn! Giới hạn: ${maxSizes[fileType] / 1024 / 1024}MB`);
                this.clearFileInput();
                return;
            }
        }

        this.pendingAttachments = this.pendingAttachments || [];

        // UI Loading State
        const previewList = document.getElementById('file-preview-list');
        const previewContainer = document.getElementById('file-preview');
        if (previewList && previewContainer) {
            previewList.innerHTML = '<div style="padding: 10px; color: var(--text-secondary); font-size: 0.9em;">Đang xử lý file...</div>';
            previewContainer.classList.remove('hidden');
        }

        // Upload files
        try {
            const uploadedFiles = await this.uploadFiles(files);
            // Store attachments
            if (this.pendingAttachments.length > 0) {
                // If user uploaded more files while pending, append them
                const newAtts = uploadedFiles.map(att => ({
                    ...att,
                    message_type: this.getFileType(att.mime_type || '')
                }));
                this.pendingAttachments = this.pendingAttachments.concat(newAtts);
            } else {
                this.pendingAttachments = uploadedFiles.map(att => ({
                    ...att,
                    message_type: this.getFileType(att.mime_type || '')
                }));
            }

            // Show preview
            this.showFilePreview();

        } catch (error) {
            console.error('Upload failed:', error);
            alert('Tải lên thất bại. Vui lòng thử lại.');
            this.clearFilePreview();
        }
    }

    async uploadFiles(files) {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        const data = await response.json();
        return data.files;
    }

    getFileType(mimeType) {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        return 'file';
    }

    showFilePreview() {
        const previewList = document.getElementById('file-preview-list');
        const previewContainer = document.getElementById('file-preview');

        if (!previewList) return;
        previewList.innerHTML = ''; // Clear previous

        if (this.pendingAttachments.length === 0) {
            this.clearFilePreview();
            return;
        }

        this.pendingAttachments.forEach((attachment, index) => {
            const item = document.createElement('div');
            item.className = 'preview-item';
            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.alignItems = 'center';
            item.style.background = 'var(--bg-tertiary)';
            item.style.padding = '8px';
            item.style.borderRadius = '8px';
            item.style.minWidth = '80px';
            item.style.maxWidth = '100px';
            item.style.position = 'relative';

            // Remove Button
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '✕';
            removeBtn.title = 'Xóa file này';
            removeBtn.style.position = 'absolute';
            removeBtn.style.top = '-5px';
            removeBtn.style.right = '-5px';
            removeBtn.style.background = 'var(--accent-danger)';
            removeBtn.style.color = 'white';
            removeBtn.style.border = 'none';
            removeBtn.style.borderRadius = '50%';
            removeBtn.style.width = '20px';
            removeBtn.style.height = '20px';
            removeBtn.style.fontSize = '12px';
            removeBtn.style.cursor = 'pointer';
            removeBtn.style.display = 'flex';
            removeBtn.style.alignItems = 'center';
            removeBtn.style.justifyContent = 'center';

            removeBtn.addEventListener('click', () => {
                this.pendingAttachments.splice(index, 1);
                this.showFilePreview(); // Re-render with new array
            });

            if (attachment.message_type === 'image') {
                const img = document.createElement('img');
                img.style.width = '60px';
                img.style.height = '60px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '4px';
                img.style.marginBottom = '5px';
                img.src = attachment.file_url;
                item.appendChild(img);
            } else {
                const icon = document.createElement('div');
                icon.textContent = '📄';
                icon.style.fontSize = '32px';
                icon.style.height = '60px';
                icon.style.display = 'flex';
                icon.style.alignItems = 'center';
                icon.style.justifyContent = 'center';
                item.appendChild(icon);
            }

            const nameSpan = document.createElement('span');
            nameSpan.textContent = attachment.filename;
            nameSpan.style.fontSize = '0.75rem';
            nameSpan.style.whiteSpace = 'nowrap';
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';
            nameSpan.style.width = '100%';
            nameSpan.style.textAlign = 'center';
            item.appendChild(nameSpan);

            item.appendChild(removeBtn);
            previewList.appendChild(item);
        });

        previewList.style.display = 'flex';
        previewList.style.overflowX = 'auto';
        previewList.style.gap = '15px';
        previewList.style.padding = '10px 5px';

        if (previewContainer) previewContainer.classList.remove('hidden');
    }

    setReplyTarget(messageData) {
        this.currentReplyTo = messageData;

        const previewContainer = document.getElementById('reply-preview');
        const usernameEl = document.getElementById('reply-preview-user');
        const textEl = document.getElementById('reply-preview-text');

        if (previewContainer && usernameEl && textEl) {
            usernameEl.textContent = messageData.username;

            if (messageData.messageType === 'image') {
                textEl.textContent = '[Hình ảnh]';
            } else if (messageData.messageType === 'video') {
                textEl.textContent = '[Video]';
            } else if (messageData.messageType === 'file') {
                textEl.textContent = '[Tập tin]';
            } else {
                textEl.textContent = messageData.content;
            }

            previewContainer.classList.remove('hidden');

            // Focus input
            document.getElementById('message-input').focus();
        }
    }

    clearReplyTarget() {
        this.currentReplyTo = null;
        const previewContainer = document.getElementById('reply-preview');
        if (previewContainer) {
            previewContainer.classList.add('hidden');
        }
    }

    clearFilePreview() {
        const preview = document.getElementById('file-preview');
        const previewList = document.getElementById('file-preview-list');
        if (preview) preview.classList.add('hidden');
        if (previewList) previewList.innerHTML = '';
        this.pendingAttachments = [];
        this.isUploading = false;
        this.isUploading = false;
        this.clearFileInput();
    }

    clearFileInput() {
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.value = '';
        }
    }

    disconnect() {
        this.isActive = false; // Disable all leak event listeners
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    /* =========================================
       Right Sidebar & Pinned Messages Logic
       ========================================= */

    initRightSidebar() {
        // Toggle Sidebar
        const infoBtn = document.getElementById('chat-info-btn');
        const closeBtn = document.getElementById('close-sidebar-right');
        const sidebar = document.getElementById('chat-sidebar-right');

        if (infoBtn) {

            infoBtn.addEventListener('click', () => {

                this.toggleRightSidebar();
            });
        } else {
            console.error('Sidebar info button NOT found');
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                sidebar.classList.add('hidden');
            });
        }
        // ... rest of function

        // Section Toggles
        ['pinned', 'media', 'settings', 'group-members'].forEach(section => {
            const header = document.getElementById(`toggle-${section}`);

            let contentId = `${section}-list`;
            if (section === 'pinned') contentId = 'pinned-messages-list';
            if (section === 'media') contentId = 'media-files-list';
            if (section === 'settings') contentId = 'chat-settings-list';
            if (section === 'group-members') contentId = 'group-members-container';

            const content = document.getElementById(contentId);

            if (header && content) {
                header.addEventListener('click', () => {
                    content.classList.toggle('hidden');
                    header.classList.toggle('collapsed');

                    // Load data if opening for first time
                    if (!content.classList.contains('hidden')) {
                        if (section === 'pinned') this.loadPinnedMessages();
                        if (section === 'media') this.loadAttachments('media');
                    }
                });
            }
        });

        // Media Tabs
        const mediaTab = document.querySelector('.tab-btn[data-tab="media"]');
        const filesTab = document.querySelector('.tab-btn[data-tab="files"]');

        if (mediaTab && filesTab) {
            mediaTab.addEventListener('click', () => {
                mediaTab.classList.add('active');
                filesTab.classList.remove('active');
                document.getElementById('media-grid').classList.remove('hidden');
                document.getElementById('files-list').classList.add('hidden');
                this.loadAttachments('media');
            });

            filesTab.addEventListener('click', () => {
                filesTab.classList.add('active');
                mediaTab.classList.remove('active');
                document.getElementById('media-grid').classList.add('hidden');
                document.getElementById('files-list').classList.remove('hidden');
                this.loadAttachments('file');
            });
        }

        // Settings Actions
        document.getElementById('sidebar-edit-nickname')?.addEventListener('click', () => {
            // Re-use profile modal but maybe limit fields? 
            // For simplicity, just open profile modal for now or implement specific modal later.
            // User requested "Edit Nickname". Let's use the profile modal but focus on nickname.
            const profileModal = document.getElementById('profile-modal');
            if (profileModal) {
                profileModal.classList.remove('hidden');
                // We are editing OUR nickname, not the partner's. 
                // IF the requirement was to edit partner's nickname, we need a different flow.
                // Assuming editing OWN nickname for now based on context "Edit Nickname".
                // If "Set Nickname for Partner", that needs DB schema change (UserRelationship or similar).
                // Let's assume editing OWN nickname.
            }
        });

        document.getElementById('sidebar-change-background')?.addEventListener('click', () => {
            const bgModal = document.getElementById('background-modal');
            if (bgModal) bgModal.classList.remove('hidden');
        });
    }

    toggleRightSidebar() {
        const sidebar = document.getElementById('chat-sidebar-right');
        sidebar.classList.toggle('hidden');

        if (!sidebar.classList.contains('hidden')) {
            this.updateRightSidebarData();
        }
    }

    updateRightSidebarData() {
        if (this.currentChatUser) {
            const avatar = document.getElementById('sidebar-avatar');
            const username = document.getElementById('sidebar-username');

            username.textContent = this.currentChatUser.nickname || this.currentChatUser.username;
            if (this.currentChatUser.avatar_url) {
                avatar.style.backgroundImage = `url(${this.currentChatUser.avatar_url})`;
                avatar.style.backgroundSize = 'cover';
                avatar.textContent = '';
            } else {
                avatar.style.backgroundImage = '';
                avatar.textContent = getInitials(this.currentChatUser.username || this.currentChatUser.name || "?");
            }

            if (this.currentChatUser.isGroup) {
                const section = document.getElementById('group-members-section');
                if (section) section.classList.remove('hidden');
                this.renderGroupMembers();
            } else {
                const section = document.getElementById('group-members-section');
                if (section) section.classList.add('hidden');

                const editBtn = document.getElementById('edit-group-info-btn');
                if (editBtn) editBtn.style.display = 'none';
            }

            // Load initial data
            this.loadPinnedMessages();
            this.loadAttachments('media');
        }
    }

    async loadPinnedMessages() {
        if (!this.currentChatUser) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/messages/${this.currentChatUser.id}/pinned`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderPinnedMessages(data.messages);
            }
        } catch (error) {
            console.error('Failed to load pinned:', error);
        }
    }

    renderPinnedMessages(messages) {
        const container = document.getElementById('pinned-messages-list');
        if (!messages || messages.length === 0) {
            container.innerHTML = '<p class="empty-text">Chưa có tin nhắn nào được ghim</p>';
            return;
        }

        container.innerHTML = '';
        messages.forEach(msg => {
            const el = document.createElement('div');
            el.className = 'pinned-message-item';
            const dateStr = formatTime(msg.created_at || msg.timestamp || new Date());

            // Format content preview
            let contentPreview = msg.content;
            if (msg.message_type === 'image') contentPreview = '📷 [Ảnh]';
            else if (msg.message_type === 'video') contentPreview = '🎥 [Video]';
            else if (msg.message_type === 'file') contentPreview = `📄 ${msg.attachment?.filename || '[File]'}`;

            el.innerHTML = `
                <div class="pinned-message-content" title="${msg.content || ''}">${contentPreview}</div>
                <div class="pinned-message-meta">
                    <span>${dateStr}</span>
                </div>
            `;
            const msgId = msg.id || msg._id;
            el.onclick = () => this.scrollToMessage(msgId);
            container.appendChild(el);
        });
    }

    togglePinMessage(messageId) {
        // ... previous code ...
    }

    scrollToMessage(messageId) {
        const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
        if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            msgEl.classList.add('highlight');
            setTimeout(() => msgEl.classList.remove('highlight'), 2000);
        } else {
            console.warn(`Message ${messageId} not found in DOM`);
            alert('Tin nhắn này chưa được tải hoặc không tìm thấy.');
        }
    }

    async loadAttachments(type) {
        if (!this.currentChatUser) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/messages/${this.currentChatUser.id}/attachments?type=${type}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (type === 'media') this.renderMedia(data.files);
                else this.renderFiles(data.files);
            }
        } catch (error) {
            console.error('Failed to load attachments:', error);
        }
    }

    getFileUrl(url) {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        return `${API_BASE_URL}${url}`;
    }

    renderMedia(files) {
        const container = document.getElementById('media-grid');
        if (!files || files.length === 0) {
            container.innerHTML = '<p class="empty-text" style="grid-column: 1/-1">Chưa có ảnh/video</p>';
            return;
        }

        container.innerHTML = '';
        files.forEach(msg => {
            if (!msg.attachment) return;
            const fullUrl = this.getFileUrl(msg.attachment.file_url);
            const el = document.createElement('div');
            el.className = 'media-item';
            el.dataset.id = msg._id || msg.id;
            if (msg.message_type === 'image') {
                el.innerHTML = `<img src="${fullUrl}" loading="lazy">`;
            } else if (msg.message_type === 'video') {
                el.innerHTML = `<video src="${fullUrl}"></video>`;
            }
            el.onclick = () => window.open(fullUrl, '_blank');
            container.appendChild(el);
        });
    }

    renderFiles(files) {
        const container = document.getElementById('files-list');
        if (!files || files.length === 0) {
            container.innerHTML = '<p class="empty-text">Chưa có file nào</p>';
            return;
        }

        container.innerHTML = '';
        files.forEach(msg => {
            if (!msg.attachment) return;
            const fullUrl = this.getFileUrl(msg.attachment.file_url);
            const el = document.createElement('div');
            el.className = 'file-item-sidebar';
            el.dataset.id = msg._id || msg.id;
            el.innerHTML = `
                <div class="file-icon">📄</div>
                <div class="file-info">
                    <span class="file-name" title="${msg.attachment.filename}">${msg.attachment.filename}</span>
                    <span class="file-size">${(msg.attachment.file_size / 1024).toFixed(1)} KB</span>
                </div>
            `;
            el.onclick = () => window.open(fullUrl, '_blank');
            container.appendChild(el);
        });
    }

    async togglePinMessage(messageId) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}/pin`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                // Update UI for specific message
                const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
                if (msgEl) {
                    msgEl.classList.toggle('pinned');
                }

                // Phát tín hiệu reload Pin List qua Socket cho nhóm/người chát chung
                this.socket.emit('pin_updated', {
                    groupId: this.currentChatUser.isGroup ? (this.currentChatUser._id || this.currentChatUser.id) : null,
                    receiverId: !this.currentChatUser.isGroup ? (this.currentChatUser._id || this.currentChatUser.id) : null
                });

                // Tự reload bản thân
                this.loadPinnedMessages();
            }
        } catch (error) {
            console.error('Pin failed:', error);
        }
    }

    async toggleReaction(messageId, type) {
        if (this.currentChatUser) {
            this.socket.emit('message_reaction', {
                messageId,
                receiverId: this.currentChatUser.id,
                type
            });
        }
    }

    handleReactionUpdate(data) {
        const { messageId, reactions } = data;
        const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
        if (msgEl) {
            const bubble = msgEl.querySelector('.message-bubble');
            let reactionsContainer = bubble.querySelector('.message-reactions');

            // If container doesn't exist (first reaction), create it
            if (!reactionsContainer && reactions.length > 0) {
                reactionsContainer = document.createElement('div');
                reactionsContainer.className = 'message-reactions';
                bubble.appendChild(reactionsContainer);
            }

            // If it exists, update it. If no reactions left, remove it.
            if (reactionsContainer) {
                if (reactions.length === 0) {
                    reactionsContainer.remove();
                } else {
                    // We need renderReactions helper. 
                    // Since it's not imported here (it's in UI), we should export it or move logic.
                    // Ideally we should import it or re-render the whole message component.
                    // But re-rendering whole component is heavy (media reloading).
                    // Let's duplicate basic render logic or import it. IMPORT is better.
                    // But `chat.js` imports `renderMessage` from `ui.js`.
                    // Let's assume we can add `renderReactions` to `ui.js` exports and use it.
                    // Or access it from window if we made it global? No modules.
                    // I'll dynamically import or just reimplement simple dom logic here.

                    this.updateReactionsDOM(reactionsContainer, reactions);
                }
            }
        }
    }

    updateReactionsDOM(container, reactions) {
        container.innerHTML = '';
        const groups = {};
        reactions.forEach(r => {
            const type = r.reaction_type || r.type;
            if (type) {
                if (!groups[type]) groups[type] = { count: 0 };
                groups[type].count++;
            }
        });

        const emojiMap = {
            'like': '👍', 'love': '❤️', 'haha': '😂', 'wow': '😮', 'sad': '😢', 'angry': '😠'
        };

        Object.entries(groups).forEach(([type, data]) => {
            const pill = document.createElement('div');
            pill.className = 'reaction-pill';

            const currentUserId = this.user.id;
            const myReaction = reactions.find(r => r.user_id === currentUserId && (r.reaction_type === type || r.type === type));
            if (myReaction) pill.classList.add('user-reacted');

            pill.innerHTML = `<span>${emojiMap[type] || type}</span> <span class="count">${data.count}</span>`;
            pill.onclick = (e) => {
                e.stopPropagation();
                this.toggleReaction(container.closest('.message').dataset.id, type);
            };
            container.appendChild(pill);
        });


    }

    async performSearch(query) {
        if (!query.trim() || !this.currentChatUser) return;

        // Reset previous search
        this.clearSearchHighlights();

        try {
            const response = await fetch(`${API_BASE_URL}/api/messages/${this.currentChatUser.id}/search?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.searchResults = data.messages || [];

                if (this.searchResults.length > 0) {
                    this.currentSearchIndex = 0;
                    this.updateSearchUI();
                    this.scrollToSearchResult();
                } else {
                    this.currentSearchIndex = -1;
                    this.updateSearchUI();
                    alert('Không tìm thấy tin nhắn nào khớp.');
                }
            }
        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    navigateSearch(direction) {
        if (this.searchResults.length === 0) return;

        // Direction: 1 (Next/Newer), -1 (Prev/Older)
        // Since results are sorted desc (newest first), "Next" button usually means "Next Result" which could be older or newer depending on user mental model. 
        // Let's assume standard "Find" behavior: Next moves to next match.
        // But in chat, "Down" is newer? 
        // Let's make: "Up" (Prev) -> Older messages (higher index in desc array), "Down" (Next) -> Newer messages (lower index).

        // wait, searchResults are sorted desc (newest at 0).
        // If I want "Older" (Previous/Up in list), I should INCREASE index.
        // If I want "Newer" (Next/Down in list), I should DECREASE index.

        let newIndex = this.currentSearchIndex - direction; // Reverse direction logic to match UI arrows

        if (newIndex < 0) newIndex = this.searchResults.length - 1; // Wrap around
        if (newIndex >= this.searchResults.length) newIndex = 0;

        this.currentSearchIndex = newIndex;
        this.updateSearchUI();
        this.scrollToSearchResult();
    }

    updateSearchUI() {
        const counter = document.getElementById('search-counter');
        if (counter) {
            if (this.searchResults.length > 0) {
                counter.textContent = `${this.searchResults.length - this.currentSearchIndex}/${this.searchResults.length}`;
                counter.classList.remove('hidden');
            } else {
                counter.classList.add('hidden');
            }
        }
    }

    clearSearchHighlights() {
        document.querySelectorAll('.message.highlight').forEach(el => {
            el.classList.remove('highlight');
            el.classList.remove('active');
        });
        this.searchResults = [];
        this.currentSearchIndex = -1;
        this.updateSearchUI();
    }

    scrollToSearchResult() {
        if (this.currentSearchIndex < 0 || this.currentSearchIndex >= this.searchResults.length) return;

        const message = this.searchResults[this.currentSearchIndex];
        const msgEl = document.querySelector(`.message[data-id="${message.id}"]`);

        // Remove active highlight from others
        document.querySelectorAll('.message.highlight.active').forEach(el => el.classList.remove('active'));

        if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            msgEl.classList.add('highlight'); // Add yellow background
            msgEl.classList.add('active'); // Add border or stronger highlight

            // Auto remove highlight after 5s? Maybe keep it while search is active. 
            // The 'active' class stays.
        } else {
            // Message not rendered?
            // In a real app with pagination, we'd need to load the message context.
            // For now, assume loaded.
            alert('Tin nhắn chưa được tải (có thể ở trang cũ hơn).');
        }
    }

    /* =========================================
       Forward Message Logic
       ========================================= */

    async openForwardModal(messageId) {
        this.forwardOriginalMsgId = messageId;
        this.forwardSelectedTargets = { users: [], groups: [] };

        const modal = document.getElementById('forward-modal');
        const listDiv = document.getElementById('forward-targets-list');
        const sendBtn = document.getElementById('send-forward-btn');
        const countBadge = document.getElementById('forward-count');

        listDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary);">Đang tải danh sách...</div>';
        sendBtn.disabled = true;
        countBadge.classList.add('hidden');
        countBadge.textContent = '0';

        modal.classList.remove('hidden');

        try {
            const token = sessionStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` };

            // Fetch contacts/users
            const [usersRes, groupsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/users`, { headers }),
                fetch(`${API_BASE_URL}/api/groups`, { headers })
            ]);

            const usersData = await usersRes.json();
            const groupsData = await groupsRes.json();

            const users = usersData.users || [];
            const groups = groupsData.groups || groupsData || [];

            listDiv.innerHTML = '';

            // Render Groups
            groups.forEach(group => {
                const label = document.createElement('label');
                label.className = 'member-item'; // Reusing style from group creation
                const groupId = group._id || group.id;
                const groupName = group.name || 'Group';
                label.innerHTML = `
                    <input type="checkbox" name="forward-target" value="${groupId}" data-type="group">
                    <div class="avatar-small">${groupName.charAt(0).toUpperCase()}</div>
                    <span class="member-name">👥 ${groupName}</span>
                `;
                label.querySelector('input').addEventListener('change', (e) => this.handleForwardTargetSelect(e));
                listDiv.appendChild(label);
            });

            // Render Users
            const currentUserId = this.currentUser && (this.currentUser._id || this.currentUser.id);
            users.filter(u => (u._id || u.id) !== currentUserId).forEach(user => {
                const label = document.createElement('label');
                label.className = 'member-item';
                const userId = user.id || user._id;
                const userName = user.nickname || user.username || user.display_name || 'User';
                const color = user.profile_color || 'blue';
                label.innerHTML = `
                    <input type="checkbox" name="forward-target" value="${userId}" data-type="user">
                    <div class="avatar-small avatar-${color}">${userName.charAt(0).toUpperCase()}</div>
                    <span class="member-name">${userName}</span>
                `;
                label.querySelector('input').addEventListener('change', (e) => this.handleForwardTargetSelect(e));
                listDiv.appendChild(label);
            });

            if (users.length === 0 && groups.length === 0) {
                listDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary);">Không có cuộc trò chuyện nào khả dụng.</div>';
            }
        } catch (error) {
            console.error('Failed to load targets for forward:', error);
            listDiv.innerHTML = '<div style="text-align: center; color: var(--error-color);">Lỗi tải danh sách.</div>';
        }
    }

    handleForwardTargetSelect(e) {
        const checkbox = e.target;
        const value = checkbox.value;
        const type = checkbox.dataset.type;

        if (checkbox.checked) {
            if (type === 'group') this.forwardSelectedTargets.groups.push(value);
            if (type === 'user') this.forwardSelectedTargets.users.push(value);
        } else {
            if (type === 'group') this.forwardSelectedTargets.groups = this.forwardSelectedTargets.groups.filter(id => id !== value);
            if (type === 'user') this.forwardSelectedTargets.users = this.forwardSelectedTargets.users.filter(id => id !== value);
        }

        const count = this.forwardSelectedTargets.groups.length + this.forwardSelectedTargets.users.length;
        const sendBtn = document.getElementById('send-forward-btn');
        const countBadge = document.getElementById('forward-count');
        const errorMsg = document.getElementById('forward-error');

        if (count > 0) {
            sendBtn.disabled = false;
            countBadge.textContent = count;
            countBadge.classList.remove('hidden');
            errorMsg.classList.add('hidden');
        } else {
            sendBtn.disabled = true;
            countBadge.classList.add('hidden');
        }
    }

    submitForwardMessage() {
        const count = this.forwardSelectedTargets.groups.length + this.forwardSelectedTargets.users.length;
        if (count === 0) {
            document.getElementById('forward-error').classList.remove('hidden');
            return;
        }

        this.socket.emit('forward_message', {
            originalMessageId: this.forwardOriginalMsgId,
            targetGroups: this.forwardSelectedTargets.groups,
            targetUsers: this.forwardSelectedTargets.users
        });

        // Close modal and reset
        const modal = document.getElementById('forward-modal');
        modal.classList.add('hidden');
        this.forwardOriginalMsgId = null;
        this.forwardSelectedTargets = { users: [], groups: [] };
    }

    scrollToMessage(messageId) {
        // Kept for compatibility if needed, but navigateSearch uses scrollToSearchResult
        const msgEl = document.querySelector(`.message[data-id="${messageId}"]`);
        if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            msgEl.classList.add('highlight');
            setTimeout(() => msgEl.classList.remove('highlight'), 2000);
        }
    }
}

export default Chat;
