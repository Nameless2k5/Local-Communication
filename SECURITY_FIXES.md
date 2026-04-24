# Tài liệu Bảo mật — Các Lỗ hổng đã Vá

> Tài liệu này ghi lại toàn bộ các lỗ hổng bảo mật đã được phát hiện và vá trong dự án Local Communication.  
> Ngôn ngữ backend: Node.js / Express / Socket.IO / MongoDB  
> Ngôn ngữ frontend: Vanilla JS (ES Modules)

---

## ĐỢT VÁ 1 — Bảo mật cơ bản (Security Hardening Pass 1)

---

### [FIX-01] Rò Rỉ Thông Tin — Email người dùng Lộ qua API

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🟠 Cao |
| **Loại** | Information Disclosure (CWE-200) |
| **File** | `models/User.js`, `routes/users.js`, `routes/profile.js` |

**Mô tả:**  
Hàm `getProfile()` và `getAllUsers()` trả về trường `email` trong response JSON. Bất kỳ người dùng đã đăng nhập nào cũng có thể truy vấn email của tất cả người dùng qua `GET /api/users` hoặc `GET /api/profile/:userId`.

**Cách tấn công:**
```
GET /api/users   →   [{ id, username, email, ... }, ...]
GET /api/profile/xyz   →   { id, username, email, ... }
```

**Đã sửa:**  
Loại bỏ trường `email` khỏi projection trong `getProfile()` và `getAllUsers()`. Email chỉ còn trả về trong `findUserById()` phục vụ nội bộ (settings page của chính người dùng).

```js
// Trước
return { id, username, email, bio, avatar_url, created_at };

// Sau
return { id, username, bio, avatar_url, created_at };
```

---

### [FIX-02] Thiếu Xác thực — Endpoint Xem Profile Công khai Không Yêu cầu Auth

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🟡 Trung bình |
| **Loại** | Broken Access Control (CWE-306) |
| **File** | `routes/profile.js` |

**Mô tả:**  
`GET /api/profile/:userId` không yêu cầu token xác thực, cho phép bất kỳ ai (thậm chí người chưa đăng nhập) tra cứu thông tin profile người dùng.

**Đã sửa:**  
Thêm middleware `authenticateToken` vào endpoint.

```js
// Trước
router.get('/:userId', async (req, res) => { ... });

// Sau
router.get('/:userId', authenticateToken, async (req, res) => { ... });
```

---

### [FIX-03] Thiếu Xác thực — Endpoint Upload File Không Yêu cầu Auth

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🔴 Nghiêm trọng |
| **Loại** | Broken Access Control (CWE-306) |
| **File** | `routes/upload.js`, `public/js/chat.js` |

**Mô tả:**  
`POST /api/upload` không yêu cầu JWT token → bất kỳ ai cũng có thể upload file lên server mà không cần tài khoản, gây lãng phí tài nguyên và có khả năng upload nội dung độc hại.

**Đã sửa:**  
- Backend: Thêm `authenticateToken` middleware vào route upload.  
- Frontend: Gửi `Authorization: Bearer <token>` header trong request upload.

```js
// Backend — routes/upload.js
router.post('/', authenticateToken, upload.array('files', 10), async (req, res) => { ... });

// Frontend — chat.js
headers: { 'Authorization': `Bearer ${this.token}` }
```

---

### [FIX-04] IDOR — Xem Tin nhắn Nhóm Không Kiểm tra Thành viên

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🔴 Nghiêm trọng |
| **Loại** | Insecure Direct Object Reference / Broken Access Control (CWE-639) |
| **File** | `routes/groups.js` |

**Mô tả:**  
`GET /api/groups/:groupId/messages` không kiểm tra người dùng có phải thành viên nhóm không. Bất kỳ người dùng nào biết `groupId` đều có thể đọc toàn bộ lịch sử chat nhóm.

**Đã sửa:**  
Thêm kiểm tra membership trước khi trả về messages.

```js
const group = await groupModel.getGroupById(groupId);
if (!group) return res.status(404).json({ error: 'Group not found' });
const isMember = group.members.some(m => m._id.toString() === req.userId);
if (!isMember) return res.status(403).json({ error: 'Forbidden' });
```

---

### [FIX-05] Thiếu Kiểm tra Quyền — Ghim Tin nhắn Nhóm (togglePin)

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🟠 Cao |
| **Loại** | Broken Access Control (CWE-639) |
| **File** | `models/Message.js` |

**Mô tả:**  
`togglePin()` không kiểm tra người dùng có phải thành viên của nhóm chứa tin nhắn hay không, cho phép người ngoài ghim/bỏ ghim tin nhắn trong nhóm bất kỳ.

**Đã sửa:**  
Thêm kiểm tra membership trong `togglePin()`.

```js
if (message.group_id) {
    const GroupSchema = require('../database/schemas/Group.schema');
    const membership = await GroupSchema.findOne({ _id: message.group_id, members: userId });
    if (!membership) throw new Error('Unauthorized');
}
```

---

### [FIX-06] Thiếu Kiểm tra Quyền — Reaction Tin nhắn (toggleReaction)

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🟡 Trung bình |
| **Loại** | Broken Access Control (CWE-639) |
| **File** | `models/Message.js` |

**Mô tả:**  
`toggleReaction()` không kiểm tra người dùng có phải là bên tham gia cuộc trò chuyện (DM hoặc nhóm) hay không.

**Đã sửa:**  
Thêm authorization check cho cả nhóm và DM.

```js
if (message.group_id) {
    const membership = await GroupSchema.findOne({ _id: message.group_id, members: userId });
    if (!membership) throw new Error('Unauthorized');
} else {
    // DM: chỉ cho phép sender hoặc receiver
    if (message.sender_id.toString() !== userId && message.receiver_id?.toString() !== userId) {
        throw new Error('Unauthorized');
    }
}
```

---

## ĐỢT VÁ 2 — Kiểm tra bảo mật chuyên sâu (Burp Suite / Pentest Pass)

---

### [FIX-07] XSS — Typing Indicator Không Escape Username

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🔴 Nghiêm trọng |
| **Loại** | Stored XSS / Reflected XSS (CWE-79) |
| **File** | `public/js/chat.js` → `showTypingIndicator()` |

**Mô tả:**  
Biến `username` lấy từ socket event được nhúng trực tiếp vào `innerHTML` mà không được escape. Kẻ tấn công có thể đặt username chứa mã JavaScript độc hại.

```js
// LỔ HỔNG
indicator.innerHTML = `<strong>${username}</strong> đang nhập ${dotsHTML}`;
```

**Đã sửa:**  
Dùng DOM API thay `innerHTML`. Gán `username` qua `textContent` để tự động escape.

```js
// ĐÃ SỬA
const strong = document.createElement('strong');
strong.textContent = username; // textContent tự escape
indicator.appendChild(strong);
indicator.append(' đang nhập ');
```

---

### [FIX-08] XSS — renderGroupMembers Không Escape Dữ liệu Thành viên

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🔴 Nghiêm trọng |
| **Loại** | Stored XSS (CWE-79) |
| **File** | `public/js/chat.js` → `renderGroupMembers()` |

**Mô tả:**  
`member.username` và `member.avatar_url` lấy từ API được nhúng vào `innerHTML` template literal mà không escape. Nếu database bị compromise hoặc có API injection, XSS có thể kích hoạt.

```js
// LỔ HỔNG
el.innerHTML = `...<span>${member.username}</span>...
style="background-image: url(${member.avatar_url})"`;
```

**Đã sửa:**  
Dùng `escapeHTML()` cho tất cả dữ liệu người dùng trước khi nhúng vào innerHTML.

```js
// ĐÃ SỬA
el.innerHTML = `...<span>${escapeHTML(member.username)}</span>...
style="background-image: url(${escapeHTML(member.avatar_url)})"`;
```

---

### [FIX-09] XSS — renderPinnedMessages Không Escape Tên File và Nội dung

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🔴 Nghiêm trọng |
| **Loại** | Stored XSS (CWE-79) |
| **File** | `public/js/chat.js` → `renderPinnedMessages()` |

**Mô tả:**  
`contentPreview` (bao gồm `msg.attachment?.filename`) và `msg.content` được nhúng vào `innerHTML` và `title` attribute mà không escape. Tên file độc hại có thể inject HTML/JS.

```js
// LỔ HỔNG
let contentPreview = `📄 ${msg.attachment?.filename || '[File]'}`;
el.innerHTML = `<div title="${msg.content}">${contentPreview}</div>`;
```

**Đã sửa:**  

```js
// ĐÃ SỬA
let contentPreview = escapeHTML(msg.content || '');
if (msg.message_type === 'file') contentPreview = `📄 ${escapeHTML(msg.attachment?.filename || '[File]')}`;
el.innerHTML = `<div title="${escapeHTML(msg.content || '')}">${contentPreview}</div>`;
```

---

### [FIX-10] XSS — renderFiles Không Escape Tên File

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🔴 Nghiêm trọng |
| **Loại** | Stored XSS (CWE-79) |
| **File** | `public/js/chat.js` → `renderFiles()` |

**Mô tả:**  
`msg.attachment.filename` lấy từ database được nhúng thẳng vào cả `title` attribute và nội dung của `innerHTML` mà không escape.

```js
// LỔ HỔNG
el.innerHTML = `<span title="${msg.attachment.filename}">${msg.attachment.filename}</span>`;
```

**Đã sửa:**  

```js
// ĐÃ SỬA
el.innerHTML = `<span title="${escapeHTML(msg.attachment.filename)}">${escapeHTML(msg.attachment.filename)}</span>`;
```

---

### [FIX-11] Injection — Client có thể Giả mạo `message_type: 'system'` qua Socket

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🟠 Cao |
| **Loại** | Input Validation / Message Spoofing (CWE-20) |
| **File** | `server.js` → socket `send_message` handler |

**Mô tả:**  
Client gửi `{ message_type: 'system' }` trong payload socket event `send_message`. Server dùng giá trị này trực tiếp → kẻ tấn công có thể tạo tin nhắn system giả (ví dụ: giả mạo thông báo hệ thống).

**Đã sửa:**  
Allowlist `message_type`, từ chối mọi giá trị ngoài danh sách hợp lệ.

```js
// ĐÃ SỬA
const allowedMessageTypes = ['text', 'image', 'video', 'file', 'link'];
const message_type = allowedMessageTypes.includes(data.message_type) ? data.message_type : 'text';
```

---

### [FIX-12] MIME Bypass — Upload File Có thể Bypass Kiểm tra Kiểu File

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🟠 Cao |
| **Loại** | Unrestricted File Upload (CWE-434) |
| **File** | `routes/upload.js` |

**Mô tả:**  
Bộ lọc upload chỉ kiểm tra `file.mimetype` (có thể bị giả mạo bởi client). File `.php`, `.js`, `.html` với MIME type giả `image/jpeg` có thể được upload lên server.

**Đã sửa:**  
Kết hợp kiểm tra cả MIME type VÀ phần mở rộng file bằng regex.

```js
// ĐÃ SỬA
const allowedExts = /\.(jpeg|jpg|png|gif|webp|mp4|webm|mov|pdf|doc|docx|zip)$/i;
const ext = path.extname(file.originalname);

if (allowedMimes.includes(file.mimetype) && allowedExts.test(ext)) {
    cb(null, true);
} else {
    cb(new Error('Invalid file type'));
}
```

---

### [FIX-13] IDOR — `set_nickname` Cho phép Đặt Biệt danh Cho Người Ngoài Cuộc Trò chuyện

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🟠 Cao |
| **Loại** | Insecure Direct Object Reference (CWE-639) |
| **File** | `server.js` → socket `set_nickname` handler |

**Mô tả:**  
Socket handler `set_nickname` nhận `targetUserId` từ client mà không xác minh `targetUserId` có phải là một trong hai bên của cuộc trò chuyện (`socket.userId` hoặc `partnerId`). Kẻ tấn công có thể đặt biệt danh cho người dùng bất kỳ trong cặp conversation của mình.

**Đã sửa:**  
Thêm kiểm tra `targetUserId` phải là `socket.userId` hoặc `partnerId`.

```js
// ĐÃ SỬA
if (targetUserId !== socket.userId && targetUserId !== partnerId) {
    return socket.emit('error', { message: 'Invalid target user' });
}
```

---

### [FIX-14] IDOR — `forwardMessage` Không Kiểm tra Quyền Truy cập

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🔴 Nghiêm trọng |
| **Loại** | Insecure Direct Object Reference / Broken Access Control (CWE-639) |
| **File** | `models/Message.js` → `forwardMessage()` |

**Mô tả:**  
`forwardMessage` không kiểm tra:  
1. Người gửi có quyền truy cập tin nhắn gốc (`originalMessageId`) không  
2. Người gửi có phải thành viên của các nhóm đích (`targetGroups`) không  

→ Kẻ tấn công có thể forward tin nhắn từ cuộc trò chuyện mình không tham gia, hoặc forward vào nhóm mình không phải thành viên.

**Đã sửa:**  
Thêm kiểm tra membership cho cả nguồn và đích.

```js
// ĐÃ SỬA

// 1. Kiểm tra quyền truy cập tin nhắn gốc
if (originalMsg.group_id) {
    const membership = await GroupSchema.findOne({ _id: originalMsg.group_id, members: senderId });
    if (!membership) throw new Error('Unauthorized: no access to original message');
} else if (originalMsg.receiver_id) {
    const senderIdStr = senderId.toString();
    if (originalMsg.sender_id.toString() !== senderIdStr &&
        originalMsg.receiver_id.toString() !== senderIdStr) {
        throw new Error('Unauthorized: no access to original message');
    }
}

// 2. Kiểm tra membership nhóm đích
for (const groupId of targetGroups) {
    const membership = await GroupSchema.findOne({ _id: groupId, members: senderId });
    if (!membership) throw new Error(`Unauthorized: not a member of group ${groupId}`);
}
```

---

### [FIX-15] Brute Force — Không Giới hạn Số lần Đăng nhập

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🟠 Cao |
| **Loại** | Brute Force / Credential Stuffing (CWE-307) |
| **File** | `routes/auth.js` |

**Mô tả:**  
Endpoint `/api/auth/login` và `/api/auth/register` không có rate limiting. Kẻ tấn công có thể thử hàng ngàn mật khẩu mà không bị chặn.

**Đã sửa:**  
Thêm `express-rate-limit` với giới hạn khác nhau cho từng endpoint.

```js
// ĐÃ SỬA
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 10,                   // tối đa 10 lần thử
    message: { error: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 giờ
    max: 5,                    // tối đa 5 lần đăng ký
    message: { error: 'Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau 1 giờ.' }
});

router.post('/login', loginLimiter, async (req, res) => { ... });
router.post('/register', registerLimiter, async (req, res) => { ... });
```

---

### [FIX-16] Misconfiguration — CORS Wildcard `origin: '*'`

| Thuộc tính | Chi tiết |
|---|---|
| **Mức độ** | 🟠 Cao |
| **Loại** | Security Misconfiguration (CWE-16) |
| **File** | `server.js` |

**Mô tả:**  
Cả Express CORS (`app.use(cors())`) và Socket.IO CORS (`origin: '*'`) đều allow all origins. Điều này cho phép bất kỳ website nào thực hiện cross-origin request đến API, tạo điều kiện cho tấn công CSRF.

**Đã sửa:**  
Giới hạn origin theo whitelist lấy từ biến môi trường `APP_URL`.

```js
// ĐÃ SỬA — server.js
const allowedOrigins = (process.env.APP_URL || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

// Socket.IO
const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
});

// Express
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
```

**Cấu hình môi trường:**  
Thêm vào file `.env`:
```
APP_URL=https://shittimchest.blog
# Nếu cần nhiều origin (phân cách bằng dấu phẩy):
# APP_URL=https://shittimchest.blog,https://www.shittimchest.blog
```

---

## Tóm tắt

| # | Lỗ hổng | Mức độ | File | Trạng thái |
|---|---|---|---|---|
| FIX-01 | Email rò rỉ qua API | 🟠 Cao | `models/User.js` | ✅ Đã vá |
| FIX-02 | GET /profile không cần auth | 🟡 TB | `routes/profile.js` | ✅ Đã vá |
| FIX-03 | POST /upload không cần auth | 🔴 Nghiêm trọng | `routes/upload.js` | ✅ Đã vá |
| FIX-04 | IDOR đọc tin nhắn nhóm | 🔴 Nghiêm trọng | `routes/groups.js` | ✅ Đã vá |
| FIX-05 | togglePin không check membership | 🟠 Cao | `models/Message.js` | ✅ Đã vá |
| FIX-06 | toggleReaction không check quyền | 🟡 TB | `models/Message.js` | ✅ Đã vá |
| FIX-07 | XSS — typing indicator | 🔴 Nghiêm trọng | `public/js/chat.js` | ✅ Đã vá |
| FIX-08 | XSS — renderGroupMembers | 🔴 Nghiêm trọng | `public/js/chat.js` | ✅ Đã vá |
| FIX-09 | XSS — renderPinnedMessages | 🔴 Nghiêm trọng | `public/js/chat.js` | ✅ Đã vá |
| FIX-10 | XSS — renderFiles | 🔴 Nghiêm trọng | `public/js/chat.js` | ✅ Đã vá |
| FIX-11 | message_type injection qua socket | 🟠 Cao | `server.js` | ✅ Đã vá |
| FIX-12 | MIME bypass upload | 🟠 Cao | `routes/upload.js` | ✅ Đã vá |
| FIX-13 | IDOR set_nickname | 🟠 Cao | `server.js` | ✅ Đã vá |
| FIX-14 | IDOR forwardMessage | 🔴 Nghiêm trọng | `models/Message.js` | ✅ Đã vá |
| FIX-15 | Brute force đăng nhập | 🟠 Cao | `routes/auth.js` | ✅ Đã vá |
| FIX-16 | CORS wildcard | 🟠 Cao | `server.js` | ✅ Đã vá |

---

*Cập nhật lần cuối: Sau security audit session 2*
