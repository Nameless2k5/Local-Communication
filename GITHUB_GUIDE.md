# Hướng dẫn đẩy dự án lên GitHub

Dưới đây là các bước chi tiết để bạn đưa dự án Local Communication của mình lên GitHub một cách an toàn và chuẩn xác nhất.

## 1. Chuẩn bị (Kiểm tra kho chứa cục bộ)

Mở Terminal (hoặc Command Prompt / PowerShell) tại thư mục chứa dự án của bạn:
```bash
cd "/Users/huyphan/Documents/Projects/Local Communication"
```

Kiểm tra xem thư mục này đã được khởi tạo Git chưa:
```bash
git status
```
- Nếu báo `fatal: not a git repository...`, hãy chạy lệnh: `git init`
- Nếu hiện thông tin các nhánh `On branch...`, bạn chuyển sang bước tiếp theo.

## 2. Thêm và Lưu tệp tin (Commit)

Thêm tất cả các file trong dự án vào danh sách chờ (Git sẽ tự động bỏ qua các file rác nhờ file `.gitignore` mà chúng ta đã cấu hình):
```bash
git add .
```

Tạo một bản ghi (commit) để lưu lại trạng thái làm việc này:
```bash
git commit -m "Hoàn thiện dự án Local Communication bản chuẩn, sửa lỗi socket và optimize UI"
```

## 3. Tạo Repository mới trên GitHub

1. Truy cập [GitHub.com](https://github.com/) và đăng nhập vào tài khoản của bạn.
2. Nhấn vào nút **New** (hoặc dấu `+` góc trên bên phải -> **New repository**).
3. Tại ô **Repository name**, nhập tên dự án (VD: `local-communication`).
4. Tại ô **Description** (Tùy chọn), nhập mô tả ngắn gọn: *Ứng dụng chat real-time với Socket.IO và WebRTC*.
5. Tích Chọn **Public** (công khai) hoặc **Private** (bí mật).
6. **BỎ QUA** phần *Add a README file*, *Add .gitignore*, *Choose a license*. (Để kho chứa hoàn toàn trống rỗng tránh xung đột).
7. Nhấn nút xanh **Create repository**.

## 4. Kết nối và Đẩy code lên GitHub

Sau khi tạo xong, GitHub sẽ hiện ra một trang hướng dẫn đi kèm đường link repo của bạn (VD: `https://github.com/Tên_Của_Bạn/local-communication.git`).

Quay lại màn hình Terminal của dự án, nhập lần lượt 3 lệnh sau (Lưu ý: Thay thế đường link GitHub bằng link của bạn):

1. Đổi tên nhánh hiện tại thành nhánh tiêu chuẩn `main`:
   ```bash
   git branch -M main
   ```
2. Kết nối dự án ở máy tính với kho chứa trên GitHub:
   ```bash
   git remote add origin https://github.com/Tên_Của_Bạn/local-communication.git
   ```
3. Đẩy toàn bộ source code của bạn lên GitHub:
   ```bash
   git push -u origin main
   ```

*(GitHub có thể yêu cầu đăng nhập ở bước này qua trình duyệt web, hãy cấp quyền cho nó nếu được hỏi).*

## 5. Cập nhật code về sau

Bất cứ khi nào bạn sửa đổi, thêm chức năng mới, để cập nhật thay đổi đó lên GitHub, bạn chỉ cần làm lại 3 lệnh ngắn gọn sau:

```bash
git add .
git commit -m "Mô tả tính năng bạn vừa sửa (VD: Sửa lỗi A, thêm tính năng B)"
git push
```

Chúc bạn thành công! Nếu có khó khăn trong quá trình gõ lệnh, hãy cho tôi biết nhé! 🚀
