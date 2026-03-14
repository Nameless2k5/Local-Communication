export class CallManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.isCaller = false;
        this.callTargetId = null;
        this.isVideoCall = false;
        this.currentFacingMode = 'user';

        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        };

        this.bindElements();
        this.setupUIListeners();
    }

    setSocket(socket) {
        this.socket = socket;
        this.setupSocketListeners();
    }

    bindElements() {
        this.callAudioBtn = document.getElementById('call-audio-btn');
        this.callVideoBtn = document.getElementById('call-video-btn');

        // Incoming Modal
        this.incomingModal = document.getElementById('incoming-call-modal');
        this.callerAvatar = document.getElementById('caller-avatar');
        this.callerName = document.getElementById('caller-name');
        this.callTypeText = document.getElementById('call-type-text');
        this.acceptBtn = document.getElementById('accept-call-btn');
        this.rejectBtn = document.getElementById('reject-call-btn');

        // In-Call Modal
        this.inCallModal = document.getElementById('in-call-modal');
        this.localVideo = document.getElementById('local-video');
        this.remoteVideo = document.getElementById('remote-video');
        this.localVideoLabel = document.getElementById('local-video-label');
        this.remoteVideoLabel = document.getElementById('remote-video-label');
        this.callWaitingText = document.getElementById('call-waiting-text');
        this.waitingForName = document.getElementById('waiting-for-name');
        this.remoteVideoLabel = document.getElementById('remote-video-label');

        // Audio Only UI Elements
        this.audioOnlyUi = document.getElementById('audio-only-ui');
        this.audioRemoteAvatar = document.getElementById('audio-remote-avatar');
        this.audioLocalAvatar = document.getElementById('audio-local-avatar');
        this.audioRemoteName = document.getElementById('audio-remote-name');
        this.audioCallStatus = document.getElementById('audio-call-status');

        this.videoCallTimer = document.getElementById('video-call-timer');

        this.toggleMicBtn = document.getElementById('toggle-mic-btn');
        this.toggleVideoBtn = document.getElementById('toggle-video-btn');
        this.switchCameraBtn = document.getElementById('switch-camera-btn');
        this.endCallBtn = document.getElementById('end-call-btn');

        // Draggable Feature Variables
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Timer Variables
        this.callStartTime = null;
        this.callTimerInterval = null;
    }

    setupUIListeners() {
        // Drag events for In-Call Modal
        if (this.inCallModal) {
            const container = this.inCallModal.querySelector('.call-container');
            if (container) {
                container.addEventListener('mousedown', (e) => this.startDragging(e, this.inCallModal));
            }
        }
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.stopDragging());

        this.callAudioBtn?.addEventListener('click', () => this.startCall(false));
        this.callVideoBtn?.addEventListener('click', () => this.startCall(true));

        this.acceptBtn?.addEventListener('click', () => this.acceptCall());
        this.rejectBtn?.addEventListener('click', () => this.rejectCall());

        this.endCallBtn?.addEventListener('click', () => this.endCall(true));

        this.toggleMicBtn?.addEventListener('click', () => this.toggleMic());
        this.toggleVideoBtn?.addEventListener('click', () => this.toggleVideo());
        this.switchCameraBtn?.addEventListener('click', () => this.switchCamera());
    }

    setupSocketListeners() {
        if (!this.socket) return;
        this.socket.on('incoming_call', (data) => this.handleIncomingCall(data));
        this.socket.on('call_accepted', (data) => this.handleCallAccepted(data));
        this.socket.on('call_rejected', (data) => this.handleCallRejected(data));
        this.socket.on('end_call', () => this.endCall(false));
        this.socket.on('webrtc_offer', (data) => this.handleOffer(data));
        this.socket.on('webrtc_answer', (data) => this.handleAnswer(data));
        this.socket.on('webrtc_ice_candidate', (data) => this.handleIceCandidate(data));
    }

    // --- Call Actions ---
    async startCall(isVideo) {
        if (!this.app.chat || !this.app.chat.currentChatUser || this.app.chat.currentChatUser.isGroup) {
            alert("Tạm thời chỉ hỗ trợ gọi điện 1-1.");
            return;
        }

        this.isVideoCall = isVideo;
        this.isCaller = true;
        this.callTargetId = this.app.chat.currentChatUser.id;

        const targetName = this.app.chat.currentChatUser.username || this.app.chat.currentChatUser.nickname;

        // Bật chữ Đang chờ bắt máy
        if (this.callWaitingText && this.waitingForName) {
            this.waitingForName.textContent = targetName;
            this.callWaitingText.classList.remove('hidden');
        }

        // Cập nhật Nhãn tên
        if (this.remoteVideoLabel && this.localVideoLabel) {
            this.remoteVideoLabel.textContent = targetName;
            this.localVideoLabel.textContent = "Bạn";
        }

        // Cập nhật Audio Only UI
        if (this.audioRemoteName) {
            this.audioRemoteName.textContent = targetName;
        }
        if (this.audioRemoteAvatar && this.audioLocalAvatar) {
            let partnerAvatar = this.app.chat.currentChatUser.avatar_url;
            let myAvatar = (this.app.profileManager && this.app.profileManager.currentAvatarUrl) || (this.app.currentUser && this.app.currentUser.avatar_url);

            if (partnerAvatar) {
                this.audioRemoteAvatar.style.backgroundImage = `url(${partnerAvatar})`;
                this.audioRemoteAvatar.textContent = '';
            } else {
                this.audioRemoteAvatar.style.backgroundImage = '';
                this.audioRemoteAvatar.textContent = targetName.charAt(0).toUpperCase();
            }

            if (myAvatar) {
                this.audioLocalAvatar.style.backgroundImage = `url(${myAvatar})`;
                this.audioLocalAvatar.textContent = '';
            } else {
                const myName = this.app.currentUser ? (this.app.currentUser.username || this.app.currentUser.nickname) : 'B';
                this.audioLocalAvatar.style.backgroundImage = '';
                this.audioLocalAvatar.textContent = myName.charAt(0).toUpperCase();
            }
        }
        if (this.audioCallStatus) {
            this.audioCallStatus.textContent = 'Đang chờ máy...';
        }

        try {
            await this.initLocalStream();
            this.showInCallUI();

            let avatar = (this.app.profileManager && this.app.profileManager.currentAvatarUrl) || (this.app.currentUser && this.app.currentUser.avatar_url);

            this.socket.emit('request_call', {
                callerId: this.app.currentUser.id,
                callerName: this.app.currentUser.username || this.app.currentUser.nickname,
                callerAvatar: avatar,
                receiverId: this.callTargetId,
                isVideo: this.isVideoCall
            });
        } catch (error) {
            console.error('Lỗi truy cập thiết bị:', error);
            alert('Không thể truy cập Microphone/Camera. Vui lòng kiểm tra lại quyền truy cập của trình duyệt.');
            this.cleanupCall();
        }
    }

    handleIncomingCall(data) {
        // Prevent receiving another call if already in a call
        if (this.callTargetId && this.callTargetId !== data.callerId) {
            this.socket.emit('reject_call', { callerId: data.callerId });
            return;
        }

        this.callTargetId = data.callerId;
        this.isVideoCall = data.isVideo;
        this.isCaller = false;

        // Khách được gọi thì không hiện chữ Chờ bắt máy
        if (this.callWaitingText) {
            this.callWaitingText.classList.add('hidden');
        }

        // Cập nhật nhãn tên trước khi Accept/In-call UI hiện ra
        if (this.remoteVideoLabel && this.localVideoLabel) {
            this.remoteVideoLabel.textContent = data.callerName;
            this.localVideoLabel.textContent = "Bạn";
        }

        // Cập nhật Audio Only UI
        if (this.audioRemoteName) this.audioRemoteName.textContent = data.callerName;
        if (this.audioRemoteAvatar && this.audioLocalAvatar) {
            if (data.callerAvatar) {
                this.audioRemoteAvatar.style.backgroundImage = `url(${data.callerAvatar})`;
                this.audioRemoteAvatar.textContent = '';
            } else {
                this.audioRemoteAvatar.style.backgroundImage = '';
                this.audioRemoteAvatar.textContent = data.callerName.charAt(0).toUpperCase();
            }

            let myAvatar = (this.app.profileManager && this.app.profileManager.currentAvatarUrl) || (this.app.currentUser && this.app.currentUser.avatar_url);
            if (myAvatar) {
                this.audioLocalAvatar.style.backgroundImage = `url(${myAvatar})`;
                this.audioLocalAvatar.textContent = '';
            } else {
                const myName = this.app.currentUser ? (this.app.currentUser.username || this.app.currentUser.nickname) : 'B';
                this.audioLocalAvatar.style.backgroundImage = '';
                this.audioLocalAvatar.textContent = myName.charAt(0).toUpperCase();
            }
        }
        if (this.audioCallStatus) {
            this.audioCallStatus.textContent = 'Đang chờ máy...';
        }

        this.callerName.textContent = data.callerName;
        if (data.callerAvatar) {
            this.callerAvatar.style.backgroundImage = `url(${data.callerAvatar})`;
            this.callerAvatar.style.backgroundSize = 'cover';
            this.callerAvatar.textContent = '';
        } else {
            this.callerAvatar.style.backgroundImage = '';
            this.callerAvatar.style.background = 'var(--primary-gradient)';
            this.callerAvatar.textContent = data.callerName.charAt(0).toUpperCase();
        }
        this.callTypeText.textContent = data.isVideo ? 'Đang gọi video cho bạn...' : 'Đang gọi thoại cho bạn...';

        this.incomingModal.classList.remove('hidden');

        // Cần thêm chuông reo ở đây nếu có file âm thanh tĩnh (Ví dụ ringtone.mp3)
    }

    async acceptCall() {
        this.incomingModal.classList.add('hidden');
        try {
            await this.initLocalStream();
            this.showInCallUI();
            this.socket.emit('accept_call', { callerId: this.callTargetId });
        } catch (error) {
            console.error('Lỗi truy cập thiết bị:', error);
            alert('Không thể sử dụng Camera/Mic. Cuộc gọi đã tự động bị từ chối.');
            this.rejectCall();
        }
    }

    rejectCall() {
        this.incomingModal.classList.add('hidden');
        if (this.callTargetId && this.socket) {
            this.socket.emit('reject_call', { callerId: this.callTargetId });
        }
        this.cleanupCall();
    }

    async handleCallAccepted(data) {
        this.createPeerConnection();
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.socket.emit('webrtc_offer', {
                to: this.callTargetId,
                offer: offer
            });
        } catch (error) {
            console.error('Lỗi tạo Offer:', error);
            this.endCall(true);
        }
    }

    handleCallRejected(data) {
        let reason = data.reason === 'offline' ? 'Người dùng đang ngoại tuyến không thể bắt máy.' : 'Phía bên kia đã từ chối cuộc gọi.';
        alert(reason);
        this.cleanupCall();
    }

    endCall(emit = true) {
        if (emit && this.callTargetId && this.socket) {
            this.socket.emit('end_call', { to: this.callTargetId });
        }
        this.cleanupCall();
    }

    // --- WebRTC Core ---
    async initLocalStream() {
        const constraints = {
            audio: true,
            video: this.isVideoCall ? { facingMode: this.currentFacingMode } : false
        };
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.localVideo.srcObject = this.localStream;

        if (!this.isVideoCall) {
            this.localVideo.classList.add('hidden');
            this.remoteVideo.style.display = 'none';
            if (this.remoteVideoLabel) this.remoteVideoLabel.style.display = 'none';
            if (this.localVideoLabel) this.localVideoLabel.style.display = 'none';
            if (this.audioOnlyUi) this.audioOnlyUi.classList.remove('hidden');
            if (this.inCallModal) this.inCallModal.classList.add('audio-call');
        } else {
            this.localVideo.classList.remove('hidden');
            this.remoteVideo.style.display = 'block';
            if (this.remoteVideoLabel) this.remoteVideoLabel.style.display = '';
            if (this.localVideoLabel) this.localVideoLabel.style.display = '';
            if (this.audioOnlyUi) this.audioOnlyUi.classList.add('hidden');
            if (this.inCallModal) this.inCallModal.classList.remove('audio-call');
        }

        this.toggleMicBtn.classList.remove('muted');
        if (!this.isVideoCall) {
            this.toggleVideoBtn.classList.add('hidden');
            this.switchCameraBtn?.classList.add('hidden');
        } else {
            this.toggleVideoBtn.classList.remove('hidden');
            this.toggleVideoBtn.classList.remove('video-off');
            this.switchCameraBtn?.classList.remove('hidden');
        }
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.configuration);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        this.peerConnection.ontrack = (event) => {
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
                this.remoteVideo.srcObject = this.remoteStream;
            }
            this.remoteStream.addTrack(event.track);

            // Ẩn chữ Chờ bắt máy khi có tín hiệu Track trả về
            if (this.callWaitingText) {
                this.callWaitingText.classList.add('hidden');
            }

            // Bắt đầu đếm thời gian chung cho cả Audio và Video
            this.startCallTimer();
        };

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('webrtc_ice_candidate', {
                    to: this.callTargetId,
                    candidate: event.candidate
                });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('Trạng thái kết nối WebRTC:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'disconnected' ||
                this.peerConnection.connectionState === 'failed' ||
                this.peerConnection.connectionState === 'closed') {
                this.endCall(false);
            }
        };
    }

    async handleOffer(data) {
        if (this.isCaller) return;

        this.createPeerConnection();
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            if (this.socket) {
                this.socket.emit('webrtc_answer', {
                    to: this.callTargetId,
                    answer: answer
                });
            }
        } catch (error) {
            console.error('Lỗi khi tiếp nhận Offer:', error);
            this.endCall(true);
        }
    }

    async handleAnswer(data) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        } catch (error) {
            console.error('Lỗi xử lý Answer:', error);
        }
    }

    async handleIceCandidate(data) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (error) {
            console.error('Lỗi tiếp nhận ICE candidate:', error);
        }
    }

    // --- UI and Utils ---
    showInCallUI() {
        this.inCallModal.classList.remove('hidden');
    }

    hideInCallUI() {
        this.inCallModal.classList.add('hidden');
        this.incomingModal.classList.add('hidden');
    }

    toggleMic() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.toggleMicBtn.classList.toggle('muted', !audioTrack.enabled);
            }
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.toggleVideoBtn.classList.toggle('video-off', !videoTrack.enabled);
            }
        }
    }

    async switchCamera() {
        if (!this.isVideoCall || !this.localStream) return;

        // Vô hiệu hóa nút tạm thời để tránh click liên tục
        if (this.switchCameraBtn) this.switchCameraBtn.disabled = true;

        // Đảo ngược chế độ camera
        this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';

        try {
            // Yêu cầu luồng video mới với camera đích
            const constraints = {
                audio: false,
                video: { facingMode: this.currentFacingMode }
            };

            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newVideoTrack = newStream.getVideoTracks()[0];

            // Lấy video track cũ
            const oldVideoTrack = this.localStream.getVideoTracks()[0];

            // Thay thế track trong WebRTC PeerConnection (để phía kia thấy camera mới)
            if (this.peerConnection) {
                const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(newVideoTrack);
                }
            }

            // Thay thế track trong luồng hiển thị cục bộ (chính mình xem)
            this.localStream.removeTrack(oldVideoTrack);
            this.localStream.addTrack(newVideoTrack);

            // Cập nhật thẻ video
            this.localVideo.srcObject = this.localStream;

            // Tắt stream của camera cũ để giải phóng tài nguyên
            oldVideoTrack.stop();

            // Giữ nguyên trạng thái tắt/mở video hiện tại
            newVideoTrack.enabled = oldVideoTrack.enabled;

        } catch (error) {
            console.error('Lỗi khi chuyển camera:', error);
            // Revert state
            this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
            alert('Không thể chuyển đổi camera lúc này.');
        } finally {
            if (this.switchCameraBtn) this.switchCameraBtn.disabled = false;
        }
    }

    cleanupCall() {
        this.hideInCallUI();
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.isCaller = false;
        this.callTargetId = null;
        this.localVideo.srcObject = null;
        this.remoteVideo.srcObject = null;

        if (this.audioOnlyUi) this.audioOnlyUi.classList.add('hidden');
        if (this.videoCallTimer) this.videoCallTimer.classList.add('hidden');
        if (this.inCallModal) this.inCallModal.classList.remove('audio-call');
        if (this.remoteVideoLabel) this.remoteVideoLabel.style.display = '';
        if (this.localVideoLabel) this.localVideoLabel.style.display = '';

        this.toggleMicBtn.classList.remove('muted');
        this.toggleVideoBtn.classList.remove('video-off');
        this.toggleVideoBtn.classList.remove('hidden');
        this.switchCameraBtn?.classList.add('hidden');
        this.currentFacingMode = 'user';

        this.stopCallTimer();
    }

    // --- Timer Logic ---
    startCallTimer() {
        this.callStartTime = new Date();

        if (this.audioCallStatus) {
            this.audioCallStatus.classList.remove('pulse'); // Bỏ chóp chép khi trả lời
            this.audioCallStatus.style.animation = 'none';
        }

        if (this.isVideoCall && this.videoCallTimer) {
            this.videoCallTimer.classList.remove('hidden');
        }

        this.updateTimerDisplay(); // Initial display
        this.callTimerInterval = setInterval(() => this.updateTimerDisplay(), 1000);
    }

    stopCallTimer() {
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        if (this.audioCallStatus) {
            this.audioCallStatus.style.animation = ''; // Reset animation
        }
    }

    updateTimerDisplay() {
        if (!this.callStartTime) return;

        const now = new Date();
        const diffMs = now - this.callStartTime;
        const diffSecs = Math.floor(diffMs / 1000);

        const minutes = Math.floor(diffSecs / 60).toString().padStart(2, '0');
        const seconds = (diffSecs % 60).toString().padStart(2, '0');

        const timeString = `${minutes}:${seconds}`;

        if (!this.isVideoCall && this.audioCallStatus) {
            this.audioCallStatus.textContent = timeString;
        } else if (this.isVideoCall && this.videoCallTimer) {
            this.videoCallTimer.textContent = timeString;
        }
    }

    // --- Draggable Logic ---
    startDragging(e, element) {
        // Prevent dragging if clicking on buttons
        if (e.target.closest('.call-btn')) return;

        this.isDragging = true;
        element.classList.add('dragging');

        // Calculate offset
        const rect = element.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;
    }

    drag(e) {
        if (!this.isDragging || !this.inCallModal) return;
        e.preventDefault();

        const x = e.clientX - this.dragOffsetX;
        const y = e.clientY - this.dragOffsetY;

        // Bounding box limits (keep within screen)
        const maxX = window.innerWidth - this.inCallModal.offsetWidth;
        const maxY = window.innerHeight - this.inCallModal.offsetHeight;

        this.inCallModal.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        this.inCallModal.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
        this.inCallModal.style.right = 'auto'; // Reset right position to prevent conflict
    }

    stopDragging() {
        this.isDragging = false;
        if (this.inCallModal) {
            this.inCallModal.classList.remove('dragging');
        }
    }
}
