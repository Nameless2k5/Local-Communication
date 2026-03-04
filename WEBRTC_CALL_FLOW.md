# Kiến Trúc Tính Năng Gọi Thoại & Video (WebRTC)

Tài liệu này mô tả chi tiết cách hoạt động của tính năng gọi điện thoại (Audio) và gọi Video trong dự án **Local Communication**. Tính năng được xây dựng dựa trên giao thức **WebRTC (Web Real-Time Communication)** kết hợp với **Socket.IO** làm Signaling Server.

---

## 1. Thành phần Cốt lõi

*   **WebRTC Client (`public/js/webrtc.js`):** Class `CallManager` quản lý kết nối P2P, luồng Media (Camera/Mic) và giao diện UI (cập nhật trạng thái, đồng hồ đếm giây).
*   **Signaling Server (`server.js`):** Đóng vai trò làm tổng đài giúp 2 trình duyệt tìm thấy nhau và trao đổi các thông tin kết nối (SDP offer/answer, ICE candidates) thông qua Socket.IO.
*   **Giao diện (`index.html` & `style.css`):** Chứa các Modal hiển thị cho cuộc gọi Video (hiển thị 2 khung hình) và Voice Call (hiển thị Avatar dạng lồng nhau kiểu UI hiện đại).

---

## 2. Luồng Hoạt Động Của Một Cuộc Gọi (Signaling Flow)

Quá trình bắt đầu kể từ lúc Người Gọi (Caller) bấm nút Gọi đến khi Kết nối P2P thành công.

### Bước 1: Khởi tạo Cuộc gọi
1. Người gọi bấm nút 📞 (Audio) hoặc 🎥 (Video).
2. Hệ thống gọi phương thức `navigator.mediaDevices.getUserMedia()` để xin quyền truy cập Mic/Camera.
3. Client phát sự kiện Socket `request_call` lên Server, kèm theo Client ID của người nhận (`targetId`).

### Bước 2: Phản hồi từ Người Nhận (Callee)
1. Server tìm Socket ID của Người nhận và gửi sự kiện `incoming_call` chứa thông tin cuộc gọi.
2. Trình duyệt người nhận hiển thị thẻ Modal "Cuộc gọi đến..." với tên Người gọi.
3. Người nhận bấm **Chấp nhận (Accept)**. Client xin quyền Mic/Camera và phát sự kiện `accept_call` về lại cho Caller.

### Bước 3: Trao đổi SDP (Offer / Answer)
Đây là bước cực kỳ quan trọng để 2 thiết bị hiểu được định dạng Media của nhau:
1. **Người Gọi (Caller)** nhận được tin báo `call_accepted` -> Khởi tạo `RTCPeerConnection`. Tạo ra một tín hiệu **Offer (SDP)** và gửi lên Server.
2. Server điều hướng sự kiện `offer` này đến máy **Người Nhận (Callee)**.
3. **Người Nhận** nhận được `offer`, set vào `RemoteDescription`. Sau đó tạo ra luồng phản hồi **Answer (SDP)** và gửi lại Server.
4. **Người Gọi** nhận được `answer`, set vào `RemoteDescription`. Tại thời điểm này, 2 bên đã hiểu được Profile Media của nhau.

### Bước 4: Tìm đường mạng (ICE Candidates)
Song song với Bước 3, cả 2 bên liên tục tìm kiếm đường truyền mạng tốt nhất thông qua máy chủ STUN (dùng Server STUN miễn phí của Google để vượt NAT/Firewall).
*   Mỗi khi tìm thấy một lộ trình (ICE), Client phát dữ liệu này qua Socket sự kiện `ice_candidate`.
*   Phía bên kia nhận được sẽ thêm địa chỉ mạng đó qua hàm `addIceCandidate()`.

### Bước 5: Kết nối thành công & Tương tác Media
*   Khi có đường truyền mạng thông suốt, sự kiện `ontrack` sẽ bắn ra trên `RTCPeerConnection` của cả 2 phía.
*   Đoạn code trong hàm `ontrack` sẽ nhận luồng (Stream) của đối phương và đổ vào thẻ `<video>` hoặc luồng `<audio>`.
*   Các UI "Đang chờ bắt máy" được ẩn đi và **Đồng hồ bấm giây** bắt đầu tính kim (`startCallTimer`). Cuộc trò chuyện chính thức diễn ra P2P (Peer-to-Peer trực tiếp).

---

## 3. Quản Lý Giao Diện Trực Quan (UI/UX)

Tính năng hỗ trợ thay đổi DOM thông minh dựa theo loại hình cuộc gọi:

*   **Video Call:**
    *   Hiển thị Thẻ `<video>` lớn giữa màn hình (dành cho người đối diện).
    *   Hiển thị Thẻ `<video>` nhỏ ở góc phải (Mini Picture-in-Picture) cho Camera của chính mình.
    *   Đồng hồ đếm thời gian dạng kính mờ (`backdrop-filter: blur`) nổi lên ở góc trên bên trái màn hình.

*   **Audio Call (Voice):**
    *   Ẩn màn hình đen Video của WebRTC.
    *   Sử dụng UI dạng Avatar đôi (Lồng ghép Avatar nhỏ bên dưới góc phải của Avatar lớn). Cả 2 bức ảnh được set CSS `background-size: cover` và canh lề Flex để tự động tạo Ký Tự nếu người dùng cài đặt Mặc Định.
    *   Đồng hồ đếm chuyển về giữa màn hình thay cho trạng thái Pinging.

---

## 4. Xử Lý Kết Thúc & Cắt Cuộc Gọi
1. Một trong hai phía nhấn **Nút Đỏ (Kết thúc)**.
2. Client tự đóng luồng Stream nội bộ (`localStream.getTracks().stop()`) và đóng RTCPeerConnection.
3. Ngắt Timer định tuyến bằng hàm `stopCallTimer()`.
4. Phát đi tín hiệu `reject_call` hoặc `end_call` cho đối tác.
5. Máy đối tác khi nhận sẽ trigger hàm `cleanupCall()` dọn dẹp biến, reset Modal và quay bộ đếm Giây về gốc.
