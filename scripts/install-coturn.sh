#!/bin/bash
# ============================================================
#  Cài đặt TURN Server (coturn) cho Local Communication
#  Chạy với quyền root trên Ubuntu/Debian
# ============================================================
set -e

# ---- Màu sắc output ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ---- Kiểm tra root ----
[[ $EUID -ne 0 ]] && error "Vui lòng chạy script với quyền root: sudo bash install-coturn.sh"

# ---- Lấy IP Public của server tự động ----
SERVER_IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me)
[[ -z "$SERVER_IP" ]] && error "Không lấy được IP Public. Kiểm tra kết nối mạng."
info "IP Public phát hiện: $SERVER_IP"

DOMAIN="shittimchest.blog"
TURN_USER="localcomm"
TURN_PASS="localcomm2025"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

# ---- Cài coturn ----
info "Cài đặt coturn..."
apt update -qq
apt install -y coturn

# ---- Bật service ----
info "Bật coturn service..."
sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# ---- Backup config cũ ----
cp /etc/turnserver.conf /etc/turnserver.conf.bak 2>/dev/null || true

# ---- Kiểm tra SSL cert ----
USE_TLS=false
if [[ -f "$CERT_PATH/fullchain.pem" && -f "$CERT_PATH/privkey.pem" ]]; then
    USE_TLS=true
    info "Tìm thấy SSL cert tại $CERT_PATH → bật TLS."
else
    warn "Không tìm thấy SSL cert ở $CERT_PATH → chạy không có TLS (chỉ port 3478)."
fi

# ---- Ghi cấu hình ----
info "Ghi cấu hình /etc/turnserver.conf..."
cat > /etc/turnserver.conf << EOF
# === Cấu hình coturn cho $DOMAIN ===

listening-port=3478
tls-listening-port=5349

external-ip=$SERVER_IP
relay-ip=$SERVER_IP

# Xác thực
user=$TURN_USER:$TURN_PASS
realm=$DOMAIN
lt-cred-mech
fingerprint

# STUN cũng phục vụ trên cùng port
no-multicast-peers
no-cli
EOF

if $USE_TLS; then
cat >> /etc/turnserver.conf << EOF

# TLS
cert=$CERT_PATH/fullchain.pem
pkey=$CERT_PATH/privkey.pem
EOF
fi

cat >> /etc/turnserver.conf << EOF

# Log
log-file=/var/log/coturn/turnserver.log
EOF

mkdir -p /var/log/coturn

# ---- Mở firewall ----
info "Mở port firewall (nếu dùng ufw)..."
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 3478/udp
    ufw allow 3478/tcp
    ufw allow 5349/udp
    ufw allow 5349/tcp
    info "Đã mở port 3478 + 5349 (UDP/TCP)."
else
    warn "ufw không active — bỏ qua bước mở port. Kiểm tra firewall thủ công nếu cần."
fi

# ---- Khởi động ----
info "Restart coturn..."
systemctl enable coturn
systemctl restart coturn
sleep 2

# ---- Kết quả ----
echo ""
if systemctl is-active --quiet coturn; then
    info "coturn đang chạy thành công!"
else
    error "coturn không khởi động được. Kiểm tra: journalctl -u coturn -n 30"
fi

echo ""
echo -e "${GREEN}======================================================"
echo "  TURN Server đã sẵn sàng!"
echo "======================================================"
echo -e "${NC}"
echo "  Domain : $DOMAIN"
echo "  IP     : $SERVER_IP"
echo "  Port   : 3478 (UDP/TCP)${USE_TLS:+ | 5349 (TLS)}"
echo "  User   : $TURN_USER"
echo "  Pass   : $TURN_PASS"
echo ""
echo "  Kiểm tra bằng trang:"
echo "  https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/"
echo "  TURN URI: turn:$DOMAIN:3478 | User: $TURN_USER | Pass: $TURN_PASS"
echo "  → Nếu thấy candidate loại 'relay' là thành công!"
echo ""
if $USE_TLS; then
    info "Nhớ cho phép certbot đọc key bởi turnserver:"
    echo "    chown -R turnserver:turnserver $CERT_PATH"
    echo "    chmod 640 $CERT_PATH/privkey.pem"
fi
