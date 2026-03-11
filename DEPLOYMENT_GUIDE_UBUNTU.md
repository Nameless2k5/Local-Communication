# Hướng dẫn Deploy Local Communication lên LXC (Proxmox)

Tài liệu này hướng dẫn cách đưa dự án Node.js (WebRTC) lên mạng Internet sử dụng trình ảo hoá LXC Container (Debian/Ubuntu) trên Proxmox.

## Điều Kiện Chuẩn Bị (Prerequisites)

1. Máy chủ vật lý đã cài đặt **Proxmox Virtual Environment (PVE)**.
2. Đã tải Template LXC của Debian (hoặc Ubuntu) trên Proxmox.
3. Modem nhà mạng đã bật **Port Forwarding** (Mở Port 80, 443 và trỏ về IP tĩnh của LXC Container).
4. Đã có **Tên miền (Domain name)** và đã trỏ (A Record) về IP Public (WAN) của mạng nhà bạn.

---

## Các Bước Cài Đặt và Cấu Hình

### Bước 1: Tạo LXC Container trên Proxmox

1. Truy cập giao diện Web của Proxmox.
2. Tại Node PVE của bạn, chọn phân vùng lưu trữ (thường là `local` hoặc `local-lvm`) -> **CT Templates** -> **Templates** và tải một template **Debian 12** (hoặc Ubuntu 22.04/24.04).
3. Click vào nút **Create CT** ở góc phải trên cùng:
   - **General**: Đặt Hostname (VD: `local-comm-web`), nhập Password cho quyền `root`.
   - **Template**: Chọn Template Debian vừa tải.
   - **Disks**: Cấp dung lượng ổ cứng (VD: 8GB - 16GB).
   - **CPU/Memory**: Cấp 1-2 Core CPU và 1024MB - 2048MB RAM tùy dung lượng trống của máy cứng.
   - **Network**: Chọn Bridge `vmbr0`, thiết lập IP tĩnh (Static IPv4) (VD: `192.168.1.100/24`) và điền Gateway (IP của cục Modem nhà mạng, VD: `192.168.1.1`).
   - Nhấn **Finish** và **Start** LXC.

### Bước 2: Cài Đặt Môi Trường Cơ Bản trong LXC

Mở **Console** của LXC trên Proxmox hoặc SSH trực tiếp vào IP của LXC, đăng nhập bằng user `root` và password bạn vừa tạo.
Tiến hành cài đặt nhanh các package cần thiết:

```bash
# 1. Cập nhật hệ thống và xoá bỏ bản node cũ gâu lỗi (nếu có)
apt update && apt upgrade -y
apt-get purge -y nodejs npm
apt-get autoremove -y

# 2. Cài đặt Node.js và NPM trực tiếp từ NodeSource (Đảm bảo có package npm)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs npm git curl

# 3. Cài đặt Nginx làm Reverse Proxy
apt install -y nginx

# 4. Cài đặt Certbot để cài HTTPS
apt install -y certbot python3-certbot-nginx

# 5. Cài đặt PM2 để chạy ngầm App Node.js qua các lần reboot
npm install -g pm2
```

### Bước 3: Đưa Code Vào LXC & Chạy Bằng PM2

1. **Clone mã nguồn:**
   ```bash
   cd /var/www
   git clone https://github.com/YourUsername/Local-Communication.git
   cd Local-Communication
   ```
   *(Thay link github trên bằng link project thực tế của bạn, hoặc dùng SFTP để ném file vào)*
   
2. **Cài đặt thư viện Node:**
   ```bash
   npm install
   ```
3. **Chạy ngầm bằng PM2:**
   ```bash
   # Giả định file chính của app là server.js (hoặc app.js) chạy ở port 3000
   pm2 start server.js --name "local-comm"
   
   # Cấu hình PM2 tự bật lại App khi LXC khởi động lại
   pm2 startup
   pm2 save
   ```

### Bước 4: Cấu Hình Nginx (Reverse Proxy & WebSocket)

Nginx sẽ đón người dùng truy cập vào cổng 80 & 443 (đã được Port Forwarding từ Router vào thẳng IP của LXC), sau đó đẩy luồng đi ngược lại ứng dụng Node.js dang chạy ngầm ở cổng 3000. Đồng thời ta cần bọc lại các Request để giao thức WebRTC sử dụng WebSocket hoạt động.

1. Xoá cấu hình Nginx mặc định:
   ```bash
   rm /etc/nginx/sites-enabled/default
   ```
2. Tạo file thiết lập cấu hình mới (thay `your-domain.com` bằng tên miền báo của bạn):
   ```bash
   nano /etc/nginx/sites-available/local-comm
   ```
3. Copy và dán khối mã sau:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com; # Đổi thành Domain hiện có của bạn

       location / {
           proxy_pass http://localhost:3000; # Port chạy local
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           
           # Xử lý IP thật do client mang theo
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```
4. Kích hoạt File Cấu hình và Bật lại Nginx:
   ```bash
   ln -s /etc/nginx/sites-available/local-comm /etc/nginx/sites-enabled/
   nginx -t     # Kiểm tra xem có lỗi cú pháp không báo OK là được
   systemctl restart nginx
   ```

### Bước 5: Cài Chứng Chỉ SSL (HTTPS) Cho WebRTC

Cổng Call (Micro / Webcam) của các Trình Duyệt **LUÔN** được bảo vệ và chỉ kích hoạt trên trang có bảo mật HTTPS.

```bash
certbot --nginx -d your-domain.com
```

*  Điền Admin Email để Let's encrypt gửi thư nếu SSL gần hết hạn.
*  Đồng ý thoả thuận (A/Y).
*  Chọn tuỳ chỉnh bật **Redirect** toàn bộ Traffic sang HTTPS (Thường là phím số 2 - Redirect).

---

## 🐋 Có thể áp dụng Docker vào việc host web này không?

**CÓ, DOCKER HOÀN TOÀN CÓ THỂ ĐƯỢC ỨNG DỤNG!** Nó mang lại khái niệm "Viết một lần, Đóng gói, Triển khai mọi nơi".

Nếu sử dụng Docker, quy trình triển khai sẽ thay đổi từ việc cài tay (Node.js + PM2 + Nginx cục bộ) sang việc bạn xây dựng ứng dụng bằng **Dockerfile** và điều tiết tất cả thông qua **docker-compose.yml**.

### Lưu ý quan trọng khi chạy Docker bên trong LXC:
Bản chất LXC là container riêng của hệ điều hành, mà Docker bản thân nó cũng là trình quản lý container. Thành ra bạn đang làm **"Nested Virtualization" (Ảo hóa lồng nhau)**. Để Docker hoạt động trơn tru trong LXC trên Proxmox:
1. Bạn phải vào cài đặt của **LXC Container** vừa tạo.
2. Chuyển đến mục **Options** -> **Features**.
3. Tick bật 2 tính năng: **keyctl** và **nesting**.
4. Lúc này khi cài Engine Docker vào LXC, nó mới hoạt động đúng.

### Có nên xài Docker cho project Node.js WebRTC?
* **Rất Khuyên Dùng Nếu:** Bạn quen dùng Docker. Nó giúp đóng gói code lại cực sạch, setup tự động nhanh bằng 1 lệnh `docker compose up -d`. Về sau có cấu hình Nginx Proxy Manager đi cùng để cấp tự động SSL cực tối ưu.
* **Tạm Gác Lại Nếu:** Bạn chưa nắm rành Docker và cần tối ưu triệt để từng millisec ping cho cuộc gọi nội bộ (thông qua Node.js và hệ điều hành trực tiếp - Bare Metal logic). Việc chạy Nginx trực tiếp trên LXC (như hướng dẫn Step 1-5 ở trên) đem lại độ trễ mạng thấp nhất không thông qua thêm một bridge mạng phụ (`docker0`).

---

## Xác Nhận Hoàn Tất

Sau khi cấu trúc xong các bước: Bạn có thể ngắt kết nối Wifi máy chủ (LAN) và lấy thiết bị xài dữ liệu di động (4G/LTE) kết nối thử vào Domain với đường dẫn `https://your-domain.com`. 

*Quy Trình Gói Tin Mạng:*
**Client 4G** -> **WAN Router / Modem (Port Forwarding 443)** -> **Máy Vật Lý Proxmox** -> **LXC Container (IP Tĩnh / Port 443)** -> **Nginx (SSL Tháo gỡ)** -> **PM2 (Node.JS Port 3000).**
