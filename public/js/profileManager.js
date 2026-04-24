// Profile and Settings Management
import { API_BASE_URL } from './config.js';

class ProfileManager {
    constructor() {
        this.currentUser = null;
        this.currentPartnerId = null;
        this.isInitialized = false;
        this.resetConfirmTimeout = null;
        this.cropper = null;
        this.currentCropType = null; // 'profile' or 'group'
    }

    get token() {
        return sessionStorage.getItem('token');
    }

    init(user) {
        this.currentUser = user;
        if (!this.isInitialized) {
            this.setupEventListeners();
            this.isInitialized = true;
        }
    }

    setupEventListeners() {
        // Settings button
        document.getElementById('settings-btn')?.addEventListener('click', () => {
            this.openSettingsModal();
        });

        // Profile button
        document.getElementById('profile-btn')?.addEventListener('click', () => {
            this.openProfileModal();
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close, .btn-secondary[data-modal]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = e.currentTarget.dataset.modal;
                if (modalId) {
                    this.closeModal(modalId);
                }
            });
        });

        // Modal overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Background button in chat header
        document.getElementById('background-btn')?.addEventListener('click', () => {
            if (this.currentPartnerId) {
                this.openModal('background-modal');
            } else {
                alert('Vui lòng chọn cuộc trò chuyện trước!');
            }
        });

        // Settings save
        document.getElementById('save-settings-btn')?.addEventListener('click', () => {
            this.saveSettings();
        });

        // Profile save
        document.getElementById('save-profile-btn')?.addEventListener('click', () => {
            this.saveProfile();
        });

        // Avatar upload
        document.getElementById('upload-avatar-btn')?.addEventListener('click', () => {
            document.getElementById('avatar-upload-input').click();
        });

        document.getElementById('avatar-upload-input')?.addEventListener('change', (e) => {
            this.handleAvatarUpload(e);
        });

        // Avatar remove
        document.getElementById('remove-avatar-btn')?.addEventListener('click', () => {
            this.removeAvatar();
        });

        // Background upload
        document.getElementById('upload-background-btn')?.addEventListener('click', () => {
            document.getElementById('background-upload-input').click();
        });

        document.getElementById('background-upload-input')?.addEventListener('change', (e) => {
            this.handleBackgroundUpload(e);
        });

        // Background reset
        const resetBtn = document.getElementById('reset-background-btn');
        if (resetBtn) {
            // Remove any existing listeners by cloning the node (drastic but effective for debugging)
            // const newResetBtn = resetBtn.cloneNode(true);
            // resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
            // Actually, let's just log for now to see if it's called

            resetBtn.addEventListener('click', (e) => {
                e.preventDefault();

                if (resetBtn.classList.contains('confirm-state')) {
                    // Second click - execute reset
                    this.resetBackground();

                    // Reset button state
                    resetBtn.classList.remove('confirm-state');
                    resetBtn.textContent = '🔄 Đặt lại mặc định';
                    resetBtn.classList.remove('btn-danger');
                    if (this.resetConfirmTimeout) clearTimeout(this.resetConfirmTimeout);
                } else {
                    // First click - show confirmation
                    resetBtn.classList.add('confirm-state');
                    resetBtn.textContent = '⚠️ Nhấn lại để xác nhận';
                    // Optional: change style to indicate warning if desired
                    resetBtn.style.color = '#ef4444'; // Red color

                    this.resetConfirmTimeout = setTimeout(() => {
                        resetBtn.classList.remove('confirm-state');
                        resetBtn.textContent = '🔄 Đặt lại mặc định';
                        resetBtn.style.color = ''; // Reset color
                    }, 3000); // 3 seconds timeout
                }
            });
        }

        // Cropper actions
        document.getElementById('btn-crop-submit')?.addEventListener('click', () => {
            this.handleCropSubmit();
        });

        // Clean up cropper when closing modal
        document.querySelectorAll('.close-modal[data-modal="cropper-modal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.cropper) {
                    this.cropper.destroy();
                    this.cropper = null;
                }

                const cropperModal = document.getElementById('cropper-modal');
                if (cropperModal) cropperModal.classList.add('hidden');

                // Trả lại Form Edit Group nếu đang thao tác bên Ảnh Nhóm
                if (this.currentCropType === 'group') {
                    const editGroupModal = document.getElementById('edit-group-modal');
                    if (editGroupModal) editGroupModal.classList.remove('hidden');
                }
            });
        });
    }

    setCurrentPartner(partnerId) {
        this.currentPartnerId = partnerId;
    }

    async openSettingsModal() {
        try {
            // Fetch current settings
            const response = await fetch(`${API_BASE_URL}/api/settings`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const toggle = document.getElementById('email-notifications-toggle');
                if (toggle) {
                    toggle.checked = data.email_notifications?.enabled ?? true;
                }
            }

            this.openModal('settings-modal');
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.openModal('settings-modal');
        }
    }

    async saveSettings() {
        try {
            const enabled = document.getElementById('email-notifications-toggle').checked;

            const response = await fetch(`${API_BASE_URL}/api/settings`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email_notifications: {
                        enabled,
                        send_immediately: true
                    }
                })
            });

            if (response.ok) {
                alert('✅ Cài đặt đã được lưu!');
                this.closeModal('settings-modal');
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (error) {
            console.error('Save settings error:', error);
            alert('❌ Không thể lưu cài đặt. Vui lòng thử lại.');
        }
    }

    async openProfileModal() {
        try {
            // Fetch current profile
            const response = await fetch(`${API_BASE_URL}/api/profile/${this.currentUser.id}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const profile = await response.json();

                document.getElementById('profile-username').value = profile.username;
                document.getElementById('profile-bio').value = profile.bio || '';
                document.getElementById('profile-email').value = profile.email;

                // Avatar
                const avatarImg = document.getElementById('profile-avatar-img');
                const avatarPlaceholder = document.querySelector('.avatar-placeholder');
                const removeBtn = document.getElementById('remove-avatar-btn');

                if (profile.avatar_url) {
                    avatarImg.src = profile.avatar_url;
                    avatarImg.style.display = 'block';
                    avatarPlaceholder.style.display = 'none';
                    removeBtn.style.display = 'inline-block';
                } else {
                    avatarImg.style.display = 'none';
                    avatarPlaceholder.style.display = 'flex';
                    removeBtn.style.display = 'none';
                }
            }

            this.openModal('profile-modal');
        } catch (error) {
            console.error('Failed to load profile:', error);
            this.openModal('profile-modal');
        }
    }

    async saveProfile() {
        try {
            const bio = document.getElementById('profile-bio').value.trim();

            const response = await fetch(`${API_BASE_URL}/api/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ bio })
            });

            if (response.ok) {
                alert('✅ Hồ sơ đã được cập nhật!');
                this.closeModal('profile-modal');
            } else {
                throw new Error('Failed to save profile');
            }
        } catch (error) {
            console.error('Save profile error:', error);
            alert('❌ Không thể lưu hồ sơ. Vui lòng thử lại.');
        }
    }

    handleAvatarUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file
        if (!file.type.startsWith('image/')) {
            alert('❌ Vui lòng chọn file ảnh!');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            alert('❌ Ảnh quá lớn! Giới hạn 2MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.openCropModal(e.target.result, 'profile');
        };
        reader.readAsDataURL(file);

        // Reset input to allow choosing the same file again if aborted
        event.target.value = '';
    }

    openCropModal(imageSrc, type) {
        const cropperModal = document.getElementById('cropper-modal');
        const cropperImage = document.getElementById('cropper-image');

        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }

        // Tạm ẩn bảng Group Edit nếu Crop thuộc tính Chat Nhóm
        if (type === 'group') {
            const editGroupModal = document.getElementById('edit-group-modal');
            if (editGroupModal) editGroupModal.classList.add('hidden');
        }

        cropperImage.src = imageSrc;
        cropperModal.classList.remove('hidden');

        this.currentCropType = type;

        this.cropper = new Cropper(cropperImage, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });
    }

    async handleCropSubmit() {
        if (!this.cropper) return;

        // Lấy canvas sau khi crop với kích thước cố định
        const canvas = this.cropper.getCroppedCanvas({
            width: 400,
            height: 400,
            fillColor: '#fff',
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        // Chuyển Canvas thành Blob / File object
        canvas.toBlob(async (blob) => {
            if (!blob) {
                alert('Có lỗi xảy ra khi cắt ảnh.');
                return;
            }

            // Tạo file ngụy trang từ Blob
            const file = new File([blob], "cropped-avatar.jpg", { type: "image/jpeg" });

            try {
                if (this.currentCropType === 'profile') {
                    // --- PROFILE AVATAR UPLOAD ---
                    const formData = new FormData();
                    formData.append('avatar', file);

                    const response = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${this.token}` },
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();

                        // Update UI Preview
                        const avatarImg = document.getElementById('profile-avatar-img');
                        const avatarPlaceholder = document.querySelector('.avatar-placeholder');
                        const removeBtn = document.getElementById('remove-avatar-btn');

                        avatarImg.src = data.avatar_url;
                        avatarImg.style.display = 'block';
                        avatarPlaceholder.style.display = 'none';
                        removeBtn.style.display = 'inline-block';

                        // Update Top Sidebar Avatar
                        const sidebarAvatar = document.getElementById('current-user-avatar');
                        if (sidebarAvatar) {
                            sidebarAvatar.style.backgroundImage = `url(${data.avatar_url})`;
                            sidebarAvatar.style.backgroundSize = 'cover';
                            sidebarAvatar.textContent = '';
                        }

                        alert('✅ Avatar Cá nhân đã được cập nhật thành công!');
                    } else {
                        throw new Error('Failed to upload profile avatar');
                    }
                } else if (this.currentCropType === 'group' && window.app && window.app.chat && window.app.chat.currentChatUser) {
                    // --- GROUP AVATAR UPLOAD ---
                    const groupId = window.app.chat.currentChatUser._id || window.app.chat.currentChatUser.id;
                    const formData = new FormData();
                    formData.append('avatar', file);

                    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/avatar`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${this.token}` },
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        // Preview UI cho Edit Group Modal
                        const editGroupAvatarPreview = document.getElementById('edit-group-avatar-preview');
                        if (editGroupAvatarPreview) {
                            editGroupAvatarPreview.style.backgroundImage = `url(${data.avatar_url})`;
                            editGroupAvatarPreview.textContent = '';
                        }
                        alert('✅ Ảnh Nhóm đã được tải lên và lưu trữ thành công!');
                    } else {
                        throw new Error('Failed to upload Group avatar');
                    }
                }

                // Dọn dẹp Cropper Modal chung
                this.cropper.destroy();
                this.cropper = null;
                this.closeModal('cropper-modal');

                // Mở lại Edit Group Modal nếu là Ảnh Nhóm
                if (this.currentCropType === 'group') {
                    const editGroupModal = document.getElementById('edit-group-modal');
                    if (editGroupModal) editGroupModal.classList.remove('hidden');
                }

            } catch (error) {
                console.error('Avatar crop upload error:', error);
                alert('❌ Lỗi tải lên. Dung lượng quá lớn hoặc Server bận.');
            }
        }, 'image/jpeg', 0.9);
    }

    async removeAvatar() {
        // Removed confirmation dialog as requested
        try {
            const response = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                // Reset preview
                const avatarImg = document.getElementById('profile-avatar-img');
                const avatarPlaceholder = document.querySelector('.avatar-placeholder');
                const removeBtn = document.getElementById('remove-avatar-btn');

                avatarImg.style.display = 'none';
                avatarPlaceholder.style.display = 'flex';
                removeBtn.style.display = 'none';

                // Reset sidebar avatar
                const sidebarAvatar = document.getElementById('current-user-avatar');
                if (sidebarAvatar) {
                    sidebarAvatar.style.backgroundImage = '';
                    sidebarAvatar.textContent = this.currentUser.username.charAt(0).toUpperCase();
                }

                alert('✅ Avatar đã được xóa!');
            } else {
                throw new Error('Failed to remove avatar');
            }
        } catch (error) {
            console.error('Remove avatar error:', error);
            alert('❌ Không thể xóa avatar. Vui lòng thử lại.');
        }
    }

    async handleBackgroundUpload(event) {
        if (!this.currentPartnerId) {
            alert('❌ Vui lòng chọn cuộc trò chuyện trước!');
            return;
        }

        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('❌ Vui lòng chọn file ảnh!');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert('❌ Ảnh quá lớn! Giới hạn 5MB.');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('background', file);

            const response = await fetch(`${API_BASE_URL}/api/chat-backgrounds/${this.currentPartnerId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                this.applyBackground(data.background.background_url);
                alert('✅ Background đã được cập nhật!');
                this.closeModal('background-modal');
            } else {
                throw new Error('Failed to upload background');
            }
        } catch (error) {
            console.error('Background upload error:', error);
            alert('❌ Không thể tải lên background. Vui lòng thử lại.');
        }
    }

    async resetBackground() {
        if (!this.currentPartnerId) return;

        // Confirmation handled by button state in event listener

        try {
            const response = await fetch(`${API_BASE_URL}/api/chat-backgrounds/${this.currentPartnerId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            // Treat success (200) or not found (404) as success in UI (reset to default)
            if (response.ok || response.status === 404) {
                this.applyBackground(null);
                alert('✅ Background đã được đặt lại!');
                this.closeModal('background-modal');
            } else {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reset background');
            }
        } catch (error) {
            console.error('Reset background error:', error);
            alert('❌ Không thể đặt lại background. Vui lòng thử lại.');
        }
    }

    applyBackground(backgroundUrl) {
        const chatArea = document.getElementById('messages-container');
        if (chatArea) {
            if (backgroundUrl) {
                chatArea.style.backgroundImage = `url(${backgroundUrl})`;
                chatArea.style.backgroundSize = 'cover';
                chatArea.style.backgroundPosition = 'center';
            } else {
                chatArea.style.backgroundImage = '';
            }
        }
    }

    async loadChatBackground(partnerId) {
        this.currentPartnerId = partnerId;

        try {
            const response = await fetch(`${API_BASE_URL}/api/chat-backgrounds/${partnerId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.applyBackground(data.background_url);
            }
        } catch (error) {
            console.error('Load background error:', error);
        }
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }
}

export default ProfileManager;
