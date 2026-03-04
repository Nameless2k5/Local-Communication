// UI Component helpers
import { API_BASE_URL } from '../config.js';

export function getInitials(username) {
    return username.charAt(0).toUpperCase();
}

export function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // If today, show time
    if (diff < 86400000 && date.getDate() === now.getDate()) {
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    // If this week, show day and time
    if (diff < 604800000) {
        return date.toLocaleDateString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }

    // Otherwise show date
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function getFileUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${API_BASE_URL}${url}`;
}

// Hàm chống XSS: Chuyển các ký tự thẻ HTML thành text thuần
export function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Bắt chính xác cấu trúc URL và bọc bằng thẻ <a>
export function parseLinks(text) {
    if (!text) return '';

    // 1. Chống XSS chuẩn (bắt buộc trước khi xử lý URL để khi render innerHTML không sinh mã độc)
    let safeText = escapeHTML(text);

    // 2. Regex Parse Link (Match http/https hoặc www bắt đầu)
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;

    return safeText.replace(urlRegex, (url) => {
        let href = url;
        if (!href.match('^https?:\/\/')) {
            href = 'http://' + href;
        }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="message-link">${url}</a>`;
    });
}

export function renderUserList(user, isOnline, isActive) {
    const div = document.createElement('div');
    div.className = `user-item${isActive ? ' active' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    if (user.avatar_url) {
        avatar.style.backgroundImage = `url(${user.avatar_url})`;
        avatar.style.backgroundSize = 'cover';
        avatar.textContent = '';
    } else {
        avatar.textContent = getInitials(user.username);
    }

    const info = document.createElement('div');
    info.className = 'user-item-info';

    const name = document.createElement('h4');
    name.textContent = user.username;

    const status = document.createElement('div');
    status.className = `status${isOnline ? ' online' : ' offline'}`;
    status.textContent = isOnline ? 'Online' : 'Offline';

    info.appendChild(name);
    info.appendChild(status);

    div.appendChild(avatar);
    div.appendChild(info);

    return div;
}

export function renderGroupList(group, isActive) {
    const div = document.createElement('div');
    div.className = `user-item group-item${isActive ? ' active' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    if (group.avatar_url) {
        avatar.style.backgroundImage = `url(${group.avatar_url})`;
        avatar.style.backgroundSize = 'cover';
        avatar.textContent = '';
    } else {
        avatar.textContent = getInitials(group.name || '?');
    }

    const info = document.createElement('div');
    info.className = 'user-item-info';

    const name = document.createElement('h4');
    name.textContent = group.name;

    const status = document.createElement('div');
    status.className = `status`;
    status.textContent = `${group.members ? group.members.length : 0} thành viên`;

    info.appendChild(name);
    info.appendChild(status);

    div.appendChild(avatar);
    div.appendChild(info);

    return div;
}

export function renderMessage(message, isSent, isGroupChat = false) {
    const div = document.createElement('div');
    div.className = `message${isSent ? ' sent' : ' received'}`;

    if (isGroupChat && !isSent) {
        const senderName = document.createElement('div');
        senderName.className = 'message-sender-name';
        senderName.textContent = (message.sender && message.sender.username) ? message.sender.username : (message.sender_username || 'Unknown');
        senderName.style.fontSize = '0.75rem';
        senderName.style.color = 'var(--text-tertiary)';
        senderName.style.marginBottom = '2px';
        senderName.style.marginLeft = '4px';
        div.appendChild(senderName);
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (message.is_deleted) {
        // Deleted message state
        div.classList.add('deleted');
        const content = document.createElement('div');
        content.className = 'message-content italic text-muted';
        content.textContent = 'Tin nhắn đã thu hồi';
        content.style.color = 'var(--text-tertiary)';
        content.style.fontStyle = 'italic';
        bubble.appendChild(content);
    } else {
        // Render Quoted Reply if exists
        if (message.is_forwarded) {
            const forwardTag = document.createElement('div');
            forwardTag.className = 'message-forward-tag';
            forwardTag.innerHTML = `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;">
                   <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                </svg> Đã chuyển tiếp
            `;
            bubble.appendChild(forwardTag);
        }

        if (message.reply_to) {
            const quotedBlock = document.createElement('div');
            quotedBlock.className = 'quoted-message';
            quotedBlock.style.cursor = 'pointer';

            quotedBlock.onclick = (e) => {
                e.stopPropagation();
                const container = document.getElementById('messages-container');
                const targetMessage = container.querySelector(`.message[data-id="${message.reply_to.id}"]`);
                if (targetMessage) {
                    // Custom Fast Smooth Scroll
                    const targetScroll = targetMessage.offsetTop - (container.clientHeight / 2) + (targetMessage.clientHeight / 2);
                    const startScroll = container.scrollTop;
                    const distance = targetScroll - startScroll;
                    const duration = 350; // Tốc độ cuộn siêu nhanh 250ms
                    let startTime = null;

                    function animation(currentTime) {
                        if (startTime === null) startTime = currentTime;
                        const timeElapsed = currentTime - startTime;
                        const progress = Math.min(timeElapsed / duration, 1);
                        // Hàm Ease-out 
                        const ease = progress * (2 - progress);
                        container.scrollTop = startScroll + distance * ease;
                        if (timeElapsed < duration) {
                            requestAnimationFrame(animation);
                        }
                    }
                    requestAnimationFrame(animation);

                    targetMessage.classList.add('highlight-target');
                    setTimeout(() => {
                        targetMessage.classList.remove('highlight-target');
                    }, 4500); // Kéo dài thời gian tồn tại của dải màu lên 4.5 giây
                }
            };

            const quotedName = document.createElement('span');
            quotedName.className = 'quoted-user';
            quotedName.textContent = message.reply_to.sender_name || 'Người dùng';

            const quotedText = document.createElement('p');
            quotedText.className = 'quoted-text';
            if (message.reply_to.message_type === 'image') {
                quotedText.textContent = '[Hình ảnh]';
            } else if (message.reply_to.message_type === 'video') {
                quotedText.textContent = '[Video]';
            } else if (message.reply_to.message_type === 'file') {
                quotedText.textContent = '[Tập tin]';
            } else {
                quotedText.textContent = message.reply_to.content || '...';
            }

            quotedBlock.appendChild(quotedName);
            quotedBlock.appendChild(quotedText);
            bubble.appendChild(quotedBlock);
        }

        // Render media based on message type
        let hasMedia = false;
        if (message.message_type === 'image' && message.attachment) {
            const fullUrl = getFileUrl(message.attachment.file_url);
            const img = document.createElement('img');
            img.src = fullUrl;
            img.className = 'message-image';
            img.alt = message.attachment.filename;
            img.loading = 'lazy';
            // Click to open image in new tab
            img.addEventListener('click', () => {
                window.open(fullUrl, '_blank');
            });
            bubble.appendChild(img);
            hasMedia = true;
        } else if (message.message_type === 'video' && message.attachment) {
            const fullUrl = getFileUrl(message.attachment.file_url);
            const video = document.createElement('video');
            video.src = fullUrl;
            video.controls = true;
            video.className = 'message-video';
            video.preload = 'metadata';
            bubble.appendChild(video);
            hasMedia = true;
        } else if (message.message_type === 'file' && message.attachment) {
            const fullUrl = getFileUrl(message.attachment.file_url);
            const fileLink = document.createElement('a');
            fileLink.href = fullUrl;
            fileLink.download = message.attachment.filename;
            fileLink.className = 'message-file';
            fileLink.target = '_blank';

            const fileName = document.createElement('span');
            fileName.textContent = message.attachment.filename;

            const fileSize = document.createElement('small');
            fileSize.textContent = formatFileSize(message.attachment.file_size);
            fileSize.style.display = 'block';
            fileSize.style.opacity = '0.7';
            fileSize.style.fontSize = '0.8rem';

            fileLink.appendChild(fileName);
            fileLink.appendChild(fileSize);
            bubble.appendChild(fileLink);
            hasMedia = true;
        }

        // Render text content (Avoid rendering if it's just the fallback filename for media)
        if (message.content) {
            const isJustFallbackFilename = hasMedia && message.attachment && (message.content === message.attachment.filename);

            if (!isJustFallbackFilename) {
                const contentText = document.createElement('div');
                contentText.className = 'message-content';
                contentText.innerHTML = parseLinks(message.content);

                if (hasMedia) {
                    contentText.style.marginTop = '6px';
                    contentText.style.padding = '0 4px'; // small padding to align nicely under images
                }

                bubble.appendChild(contentText);
            }
        }
    }

    const time = document.createElement('div');
    time.className = 'message-time';

    // Add Edited flag
    let timeText = formatTime(message.created_at || message.timestamp);
    if (message.is_edited && !message.is_deleted) {
        timeText += ' (đã sửa)';
    }
    time.textContent = timeText;

    if (isSent) {
        let readText = '';
        if (isGroupChat) {
            if (message.read_by && message.read_by.length > 0) {
                readText = `Đã xem (${message.read_by.length})`;
            }
        } else {
            if (message.read) {
                readText = 'Đã xem';
            }
        }

        if (readText) {
            const readIcon = document.createElement('span');
            readIcon.className = 'read-receipt';
            if (message.read_by && message.read_by.length > 0) {
                readIcon.dataset.count = message.read_by.length;
            }
            readIcon.textContent = readText;
            time.appendChild(document.createTextNode(' • '));
            time.appendChild(readIcon);
        }
    }

    bubble.appendChild(time);
    div.appendChild(bubble);

    // Pin Styles
    if (message.is_pinned) {
        div.classList.add('pinned');
    }
    div.dataset.id = message.id || message._id;

    // Reactions
    const reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'message-reactions';
    // DEBUG: Force fake reaction
    // renderReactions(reactionsContainer, [{ type: 'love', user_id: 'fake', count: 1 }]);
    renderReactions(reactionsContainer, message.reactions);
    bubble.appendChild(reactionsContainer);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    // Reply Button
    const replyBtn = document.createElement('button');
    replyBtn.className = 'message-action-btn reply-btn';
    replyBtn.title = 'Trả lời';
    replyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>';

    replyBtn.onclick = (e) => {
        e.stopPropagation();
        const event = new CustomEvent('reply-message', {
            detail: {
                messageId: message.id || message._id,
                username: (message.sender && message.sender.username) ? message.sender.username : (message.sender_username || 'Bạn'),
                content: message.content,
                messageType: message.message_type
            }
        });
        document.dispatchEvent(event);
    };

    // Reaction Button
    const reactBtn = document.createElement('button');
    reactBtn.className = 'message-action-btn react-btn';
    reactBtn.title = 'Thả cảm xúc';
    reactBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>';

    reactBtn.onclick = (e) => {
        e.stopPropagation();
        // Remove existing picker if any
        const existingPicker = document.querySelector('.reaction-picker');
        if (existingPicker) {
            existingPicker.remove();
            // If clicking same button, just close
            if (existingPicker.dataset.messageId === (message.id || message._id)) return;
        }

        const picker = createReactionPicker(message.id || message._id);

        // Smart positioning: if too close to top edge, pop down instead of up
        const rect = reactBtn.getBoundingClientRect();
        if (rect.top < 200) {
            picker.classList.add('picker-bottom');
        }

        // Append to bubble to position relative to it
        bubble.appendChild(picker);

        // Close picker when clicking outside
        const closePicker = (ev) => {
            if (!picker.contains(ev.target) && ev.target !== reactBtn && !reactBtn.contains(ev.target)) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        };
        setTimeout(() => document.addEventListener('click', closePicker), 0);
    };

    const moreBtnContainer = document.createElement('div');
    moreBtnContainer.className = 'message-more-container';

    const moreIconBtn = document.createElement('button');
    moreIconBtn.className = 'message-action-btn more-btn';
    moreIconBtn.title = 'Thêm';
    moreIconBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';

    // Dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'message-dropdown hidden';

    // 1. Pin Option
    const pinOption = document.createElement('div');
    pinOption.className = 'dropdown-item';
    pinOption.textContent = message.is_pinned ? 'Bỏ ghim' : 'Ghim tin nhắn';
    pinOption.onclick = (e) => {
        e.stopPropagation();
        dropdown.classList.add('hidden');
        actions.classList.remove('active-dropdown');
        document.dispatchEvent(new CustomEvent('pin-message', { detail: { messageId: message.id || message._id } }));
    };
    dropdown.appendChild(pinOption);

    // 2. Forward Option
    if (message.message_type !== 'system') {
        const forwardOption = document.createElement('div');
        forwardOption.className = 'dropdown-item';
        forwardOption.textContent = 'Chuyển tiếp';
        forwardOption.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.add('hidden');
            actions.classList.remove('active-dropdown');
            if (window.chatApp && typeof window.chatApp.openForwardModal === 'function') {
                window.chatApp.openForwardModal(message.id || message._id);
            }
        };
        dropdown.appendChild(forwardOption);
    }

    // 2. Edit and Delete (if own message)
    if (isSent && !message.is_deleted) {
        if (message.message_type === 'text') {
            const editOption = document.createElement('div');
            editOption.className = 'dropdown-item';
            editOption.textContent = 'Chỉnh sửa';
            editOption.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.add('hidden');
                actions.classList.remove('active-dropdown');

                // Inline Edit Mode
                const contentDOM = bubble.querySelector('.message-content');
                if (contentDOM) {
                    contentDOM.style.display = 'none';
                    actions.style.display = 'none';

                    const editForm = document.createElement('form');
                    editForm.className = 'inline-edit-form';

                    const editInput = document.createElement('input');
                    editInput.type = 'text';
                    editInput.className = 'inline-edit-input';
                    editInput.value = message.content;
                    editInput.required = true;

                    const editControls = document.createElement('div');
                    editControls.className = 'inline-edit-controls';

                    const saveBtn = document.createElement('button');
                    saveBtn.type = 'submit';
                    saveBtn.className = 'btn-secondary btn-sm';
                    saveBtn.textContent = 'Lưu';

                    const cancelBtn = document.createElement('button');
                    cancelBtn.type = 'button';
                    cancelBtn.className = 'btn-danger btn-sm';
                    cancelBtn.textContent = 'Huỷ';
                    cancelBtn.onclick = (ev) => {
                        ev.stopPropagation();
                        editForm.remove();
                        contentDOM.style.display = 'block';
                        actions.style.display = 'flex';
                    };

                    editControls.appendChild(cancelBtn);
                    editControls.appendChild(saveBtn);
                    editForm.appendChild(editInput);
                    editForm.appendChild(editControls);

                    editForm.onsubmit = (ev) => {
                        ev.preventDefault();
                        const newContent = editInput.value.trim();
                        if (!newContent) return;
                        document.dispatchEvent(new CustomEvent('edit-message-inline', {
                            detail: { messageId: message.id || message._id, content: newContent }
                        }));
                    };

                    const timeEl = bubble.querySelector('.message-time');
                    bubble.insertBefore(editForm, timeEl);
                    editInput.focus();
                }
            };
            dropdown.appendChild(editOption);
        }

        const deleteOption = document.createElement('div');
        deleteOption.className = 'dropdown-item text-danger';
        deleteOption.textContent = 'Thu hồi';
        deleteOption.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.add('hidden');
            actions.classList.remove('active-dropdown');
            if (confirm('Bạn có chắc chắn muốn thu hồi tin nhắn này không?')) {
                document.dispatchEvent(new CustomEvent('delete-message', {
                    detail: { messageId: message.id || message._id }
                }));
            }
        };
        dropdown.appendChild(deleteOption);
    }

    moreBtnContainer.appendChild(moreIconBtn);
    moreBtnContainer.appendChild(dropdown);

    actions.appendChild(replyBtn);
    actions.appendChild(reactBtn);
    actions.appendChild(moreBtnContainer);

    // Toggle dropdown
    moreIconBtn.onclick = (e) => {
        e.stopPropagation();
        // Hide other open dropdowns
        document.querySelectorAll('.message-dropdown:not(.hidden)').forEach(el => {
            if (el !== dropdown) {
                el.classList.add('hidden');
                const pActions = el.closest('.message-actions');
                if (pActions) pActions.classList.remove('active-dropdown');
                const pMessage = el.closest('.message');
                if (pMessage) pMessage.classList.remove('dropdown-open');
            }
        });

        const isHidden = dropdown.classList.contains('hidden');
        if (isHidden) {
            dropdown.classList.remove('hidden');
            actions.classList.add('active-dropdown');
            div.classList.add('dropdown-open');

            // Smart positioning to prevent vertical cutoff
            const rect = moreIconBtn.getBoundingClientRect();
            // Dropdown goes downwards if near the top
            if (rect.top < 180) {
                dropdown.style.bottom = 'auto';
                dropdown.style.top = '100%';
                dropdown.style.marginTop = '4px';
                dropdown.style.marginBottom = 'auto';
            } else {
                dropdown.style.bottom = '100%';
                dropdown.style.top = 'auto';
                dropdown.style.marginBottom = '4px';
                dropdown.style.marginTop = 'auto';
            }
        } else {
            dropdown.classList.add('hidden');
            actions.classList.remove('active-dropdown');
            div.classList.remove('dropdown-open');
        }
    };

    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', (ev) => {
            if (!moreBtnContainer.contains(ev.target)) {
                dropdown.classList.add('hidden');
                actions.classList.remove('active-dropdown');
                div.classList.remove('dropdown-open');
            }
        });
    }, 0);
    bubble.appendChild(actions);

    div.appendChild(bubble);
    return div;
}

function renderReactions(container, reactions) {
    container.innerHTML = '';
    if (!reactions || reactions.length === 0) return;

    // Group reactions by type
    const groups = {};
    reactions.forEach(r => {
        const type = r.reaction_type || r.type; // Check both for compatibility
        if (!type) return;

        if (!groups[type]) groups[type] = { count: 0, users: [] };
        groups[type].count++;
        groups[type].users.push(r.user_id);
    });

    // Render pills
    Object.entries(groups).forEach(([type, data]) => {
        const pill = document.createElement('div');
        pill.className = 'reaction-pill';
        // Check if current user reacted (need currentUserId, but for now just visual)
        // We can check if we have access to currentUserId via global or passed param.
        // For simplicity, let's just render. Ideally pass currentUserId to renderMessage.

        const emojiMap = {
            'like': '👍', 'love': '❤️', 'haha': '😂', 'wow': '😮', 'sad': '😢', 'angry': '😠'
        };

        pill.innerHTML = `<span>${emojiMap[type] || type}</span> <span class="count">${data.count}</span>`;
        container.appendChild(pill);
    });
}

function createReactionPicker(messageId) {
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.dataset.messageId = messageId;

    const reactions = [
        { type: 'like', emoji: '👍' },
        { type: 'love', emoji: '❤️' },
        { type: 'haha', emoji: '😂' },
        { type: 'wow', emoji: '😮' },
        { type: 'sad', emoji: '😢' },
        { type: 'angry', emoji: '😠' }
    ];

    reactions.forEach(r => {
        const span = document.createElement('span');
        span.className = 'reaction-option';
        span.textContent = r.emoji;
        span.onclick = (e) => {
            e.stopPropagation();
            const event = new CustomEvent('message-reaction', {
                detail: { messageId, type: r.type }
            });
            document.dispatchEvent(event);
            picker.remove();
        };
        picker.appendChild(span);
    });

    return picker;
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
