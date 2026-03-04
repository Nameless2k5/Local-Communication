# Local Communication

Ứng dụng web trao đổi thông tin theo thời gian thực (real-time messaging) hỗ trợ đa nền tảng với giao diện hiện đại, tối ưu chuẩn SPA (Single Page Application).

## 🚀 Tính năng nổi bật

### Giao tiếp Cơ bản & Nhóm (Groups)
- ✅ **Chat 1-1 & Group Chat** thời gian thực với Socket.IO.
- ✅ Tạo nhóm, thêm/xóa thành viên, thăng cấp phó nhóm, rời/giải tán nhóm.
- ✅ Tùy chỉnh Avatar nhóm, Tên nhóm.
- ✅ Danh sách người dùng online/offline thời gian thực.
- ✅ **Typing indicator** (hiển thị đối phương đang nhập tin nhắn).
- ✅ Hiển thị trạng thái "Đã xem" (Read Receipt).

### Tương tác Tin nhắn
- ✅ **Gửi File đa phương tiện (Media):** Hỗ trợ Ảnh, Video (có preview), File âm thanh (Voice/Music), và File tài liệu. Hợp nhất nội dung text và file vào chung một bong bóng chat.
- ✅ **Trả lời (Reply) & Chuyển tiếp (Forward)** tin nhắn.
- ✅ **Chỉnh sửa & Thu hồi (Delete)** tin nhắn hai chiều.
- ✅ **Ghim (Pin)** tin nhắn quan trọng trong hội thoại.
- ✅ **Thả cảm xúc (Reactions):** React Emoji vào từng tin nhắn cụ thể.
- ✅ Gửi tin nhắn chứa Link (Tự động nhận diện và làm nổi bật URL).

### Cuộc gọi & Hình ảnh cá nhân (WebRTC)
- ✅ **Video Call & Audio Call 1-1** sử dụng công nghệ WebRTC (End-to-end P2P), giao diện pop-up trực quan.
- ✅ Đổi **Avatar cá nhân** (Hỗ trợ tool Cắt ảnh/Crop tích hợp sẵn).
- ✅ Thay đổi **Hình nền Chat (Chat Background)** riêng biệt cho từng người dùng (Lưu file lên server).
- ✅ Cập nhật thông tin cá nhân (Bio, Nickname).
- ✅ Thông báo Desktop Notifications khi có tin nhắn hoặc cuộc gọi đến.

### Bảo mật & UX/UI
- ✅ Đăng ký / Đăng nhập an toàn với Token (JWT) lưu ở Session. Mật khẩu mã hóa BCrypt.
- ✅ Cơ chế Single Page Application (SPA), chuyển đổi trang và người chat mượt mà không cần Load lại trình duyệt.
- ✅ Khắc phục triệt để tình trạng Leak Event Listers khi đổi tài khoản.
- ✅ Giao diện Dark Mode sang trọng, Glassmorphism, Responsive (tương thích Mobile/Desktop) với CSS Grid/Flexbox.

## 🛠️ Công nghệ sử dụng

### Backend
- **Node.js** & **Express** - JavaScript server framework.
- **Socket.IO** - Real-time bidirectional event-based communication.
- **WebRTC** - Giao thức gọi Video/Audio P2P.
- **MongoDB** & **Mongoose** - Cơ sở dữ liệu NoSQL mở rộng tốt.
- **Multer** & **Sharp** - Upload và tối ưu hóa xử lý Cắt/Nén hình ảnh bằng luồng C++.
- **bcryptjs** & **jsonwebtoken** - Xử lý xác thực (Authentication).

### Frontend
- **HTML5**, **CSS3** - Vanilla CSS với variables, animations, dark theme. Không phụ thuộc framework cồng kềnh.
- **Vanilla JavaScript (ES6 Modules)** - Xử lý logic MVC/SPA, Fetch API.
- **Socket.IO Client** - Quản lý trạng thái kết nối WebSocket.
- **Cropper.js** - Tool Cắt/Chỉnh sửa ảnh trực tiếp trên trình duyệt.

## 📦 Cài đặt

### Yêu cầu
- Node.js (version 16 hoặc cao hơn).
- MongoDB (đang chạy local ở cổng 27017 hoặc có chuỗi kết nối MongoDB Atlas URI).

### Các bước cài đặt

1. Clone hoặc tải project về:
```bash
git clone https://github.com/Tên_Của_Bạn/local-communication.git
cd "Local Communication"
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Ghi đè file môi trường `.env`:
```bash
cp .env.example .env
```
*(Hãy mở file `.env` lên và điền chuỗi kết nối MongoDB `MONGODB_URI` thực tế của bạn nếu không dùng localhost).*

## 🚀 Chạy ứng dụng

### Chế độ Development (Dùng nodemon để tự restart khi code thay đổi)
```bash
npm run dev
```

### Chế độ Production
```bash
npm start
```

Server sẽ khởi chạy tại: **http://localhost:3000**

## 📖 Hướng dẫn sử dụng nhanh

1. **Truy cập:** Mở http://localhost:3000.
2. **Đăng ký/Đăng nhập:** Tạo tài khoản mới, sau đó đăng nhập.
3. **Chat 1-1:** Click vào người dùng ở cột trái (Left Sidebar) để bật khung chat. Nhấn nút (i) góc trên cùng bên phải để thay Đổi Hình Nền Chat riêng với người đó.
4. **Tạo Nhóm:** Nhấn biểu tượng 📝 (Tạo nhóm mới) cạnh thanh Tìm kiếm. Chọn thành viên và đặt tên. 
5. **Đính kèm File/Media:** Nhấn nút (Ghim giấy) cạnh thanh nhập văn bản để tải lên Hình ảnh/Video/File (tối đa 10 file cùng lúc).
6. **Video Call:** Bấm nút Camera hiển thị góc phải trong đoạn chat 1-1. Đảm bảo bạn cấp quyền truy cập Camera/Micro cho trình duyệt.
7. **Trang cá nhân:** Nhấn vào Tên/Avatar của bạn ở góc dưới cùng bên trái. Giao diện Modal sẽ hiện lên để bạn đổi Avatar (sử dụng chuột di chuyển để cắt ảnh) hoặc cập nhật Tiểu sử.

## 📁 Cấu trúc Project chính

```text
Local Communication/
├── server.js              # Entry point server
├── database/              # Kết nối MongoDB
├── middleware/            # Xác thực user, phân quyền Socket
├── models/                # File sơ đồ MongoDB (User, Message, Group...)
├── routes/                # Các HTTP RESTful API (auth, messages, upload...)
├── uploads/               # Nơi lưu trữ ảnh đại diện, media và file
└── public/
    ├── index.html         # Giao diện HTML (SPA)
    ├── css/               # Giao diện tĩnh (styles, glassmorphism)
    └── js/
        ├── app.js         # Core khởi động App, logic SPA Đăng nhập/Đăng xuất
        ├── chat.js        # Module Socket.IO, Xử lý Nhóm, Tin nhắn, Reaction
        ├── profileManager.js # Đổi background, edit thông tin cá nhân
        ├── webrtc.js      # Giao thức truyền phát Cuộc gọi Video/Audio P2P
        └── components/ui.js  # Build DOM, render giao diện HTML tự động
```

## 🔒 Bảo mật

- Mật khẩu được mã hóa một chiều qua salt `bcrypt`.
- Quản lý phiên bằng `JWT` thời hạn (7 ngày), yêu cầu Bearer token trong Headers đối với mọi HTTP request.
- Xác thực handshake gắt gao qua middleware `Socket.IO`. 
- Giao thức liên lạc chặn XSS và sanitize cơ bản.

## 🤝 Đóng góp
Mọi đóng góp đều được chào đón! Hãy tạo Pull Request hoặc báo lỗi (Issues).

## 📄 Bản quyền
ISC License

---

**Developed with ❤️ using Node.js, Socket.io, WebRTC and MongoDB.**
