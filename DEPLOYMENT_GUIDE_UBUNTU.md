# Hướng dẫn Deploy Local Communication lên Ubuntu Server (Proxmox)

Tài liệu này ghi lại các bước để đưa dự án lên mạng Internet công cộng với tính năng Gọi Video/Audio WebRTC hoạt động đầy đủ, sử dụng máy chủ Ubuntu nội bộ và cổng được mở từ nhà mạng.

## Điều Kiện Chuẩn Bị (Prerequisites)

1. Máy tính/Laptop chạy **Proxmox** chứa máy ảo **Ubuntu Server (No GUI)** bật 24/24.
2. Modem nhà mạng đã bật **Port Forwarding** (Mở Port 80 và 443 trỏ về địa chỉ IP LAN của máy ảo Ubuntu).
3. Đã có một **Tên miền (Domain name)**. Bạn có thể mua hoặc xài miễn phí qua [DuckDNS.org](https://www.duckdns.org/) và trỏ IP miền đó về IP Public (WAN) mạng nhà bạn.

---

## Các Bước Cài Đặt và Cấu Hình

### Bước 1: Cài Đặt Môi Trường Cơ Bản

SSH vào máy ảo Ubuntu Server và chạy các lệnh dưới đây để cài đặt Node.js, Nginx (Web Server) và Certbot (Công cụ xin chứng chỉ SSL miễn phí).

\`\`\`bash
# 1. Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# 2. Cài đặt Node.js (Bản 20 LTS) & NPM & Git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# 3. Cài đặt Nginx làm Reverse Proxy
sudo apt install -y nginx

# 4. Cài đặt Certbot để cài HTTPS
sudo apt install -y certbot python3-certbot-nginx

# 5. Cài đặt PM2 để chạy ngầm App Node.js không tắt khi tắt Terminal
sudo npm install -g pm2
\`\`\`

### Bước 2: Khởi Chạy Dự Án Bằng PM2

1. **Clone mã nguồn:** Bạn cần đưa thư mục code hiện tại (chứa `server.js` hoặc `index.js`) vào `/var/www` hoặc dùng Git clone thẳng về Ubuntu:
   \`\`\`bash
   cd /var/www
   sudo git clone https://github.com/YourUsername/Local-Communication.git
   cd Local-Communication
   \`\`\`
2. **Cài đặt thư viện Node:**
   \`\`\`bash
   sudo npm install
   \`\`\`
3. **Chạy ngầm bằng PM2:**
   \`\`\`bash
   # Giả định file chính của app là server.js chạy ở port 3000
   pm2 start server.js --name "local-comm"
   
   # Cấu hình PM2 tự bật lại App Local Communication khi Server cúp điện / khởi động lại
   pm2 startup
   pm2 save
   \`\`\`

### Bước 3: Cấu Hình Nginx (Reverse Proxy & WebSocket)

Nginx sẽ đón người dùng truy cập vào cổng 80 & 443, sau đó đẩy ngược dữ liệu vào ứng dụng Node.js dang chạy cổng ẩn bên trong 3000. Đồng thời ta cần bọc lại các Request để Socket.IO hoạt động không bị rơi kết nối (Connection drops).

1. Xoá cấu hình Nginx mặc định (nếu có):
   \`\`\`bash
   sudo rm /etc/nginx/sites-enabled/default
   \`\`\`
2. Trình lên file thiết lập mới (thay `your-domain.com` bằng tên miền bạn đăng kí):
   \`\`\`bash
   sudo nano /etc/nginx/sites-available/local-comm
   \`\`\`
3. Copy và dán khối mã này (Bấm `Ctrl + O`, `Enter`, `Ctrl + X` để lưu nano):
   \`\`\`nginx
   server {
       listen 80;
       server_name your-domain.com; # Đổi thành Domain của bạn

       location / {
           proxy_pass http://localhost:3000; # Port chạy local
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           
           # Xử lý IP thật của Client cho mục đích Trace và Log Node
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   \`\`\`
4. Kích hoạt File Cấu hình và Bật lại Nginx:
   \`\`\`bash
   sudo ln -s /etc/nginx/sites-available/local-comm /etc/nginx/sites-enabled/
   sudo nginx -t     # Kiểm tra cú pháp xem có lỗi typo không báo OK là chuẩn
   sudo systemctl restart nginx
   \`\`\`

### Bước 4: Chèn Ổ Khoá Phân Quyền Bảo Mật SSL (Chứng Chỉ WebRTC)

Cổng Call (Micro / Webcam) của các Trình Duyệt chỉ được kích hoạt trên trang có bảo mật HTTPS. Dùng Tool `Certbot` bọc SSL và ép (force) luồng HTTP (Cổng 80) thành luồng HTTPS (Cổng 443).

\`\`\`bash
sudo certbot --nginx -d your-domain.com
\`\`\`

*  Nhập Admin Email để Let's encrypt gửi thư nếu SSL hết hạn.
*  Đồng ý thoả thuận (A/Y).
*  Lựa chọn tuỳ chỉnh bật Redirect toàn bộ Traffic sang Mạng màng HTTPS-Bảo vệ `(Chọn Type 2 - Redirect)`.

---

## Xác Nhận Hoàn Tất

Sau khi cấu trúc xong các bước: Bạn có thể ngắt kết nối Wifi máy chủ (LAN) và lấy thiết bị xài dữ liệu di động (4G/LTE) kết nối thử vào Domain với đường dẫn `https://your-domain.com`. 

*Quy Trình Hoạt Động Cốt Lõi:*
**Người Dùng 4G (Internet)** -> **WAN Router / Modem Cáp Quang (Cổng 443 Forwarding)** -> **Máy Ảo Ubuntu Proxmox** -> **Nginx Server (Nhận SSL/ Cổng 443)** -> **Quăng vào Cổng 3000 Node.JS.**
