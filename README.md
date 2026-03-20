# Arena Quiz

Arena Quiz là dự án game đố vui theo thời gian thực, gồm 2 chế độ:
- Đấu 1v1 theo chủ đề.
- Tournament nhiều người (có host, có loại dần).

Ứng dụng được chia thành 2 phần:
- Frontend: React (CRA) chạy ở cổng 3000.
- Backend: Node.js + Express + Socket.IO + Sequelize + MySQL chạy ở cổng 4000.

## 1. Yêu cầu trước khi chạy

- Node.js 18+ và npm.
- MySQL Server (khuyến nghị MySQL 8) hoặc Xampp Phpmyadmin
- Đã giải nén source code vào thư mục `DA2`.

## 2. Cấu trúc thư mục

```text
DA2/
  README.md                          # Tài liệu hướng dẫn cài đặt và chạy dự án
  Database/
    knowledge_arena.sql              # File SQL để import CSDL ban đầu

  backend/
    node                             # File trống (không dùng trong runtime)
    package.json                     # Khai báo dependency backend
    package-lock.json                # Khóa phiên bản dependency backend
    server.js                        # Server Express + Socket.IO + Sequelize (API + realtime)
    node_modules/                    # Thư viện backend sau khi npm install

  frontend/
    .gitignore                       # Danh sách file/thư mục frontend không commit
    package.json                     # Khai báo dependency và scripts frontend
    package-lock.json                # Khóa phiên bản dependency frontend
    node_modules/                    # Thư viện frontend sau khi npm install

    public/
      favicon.ico                    # Icon tab trình duyệt
      index.html                     # HTML gốc của ứng dụng React
      logo192.png                    # Icon PWA 192x192
      logo512.png                    # Icon PWA 512x512
      manifest.json                  # Cấu hình Progressive Web App
      robots.txt                     # Cấu hình robots cho crawler

    src/
      App.js                         # Component chính: luồng game 1v1, trạng thái UI
      App.css                        # Style chính cho App
      Auth.js                        # Màn hình đăng nhập/đăng ký
      Tournament.js                  # Giao diện và logic chế độ tournament
      socket.js                      # Cấu hình kết nối Socket.IO client đến backend
      index.js                       # Entry point render React app
      index.css                      # CSS global
      App.test.js                    # Test cho App
      setupTests.js                  # Cấu hình test (Testing Library/Jest)
      reportWebVitals.js             # Đo hiệu năng web vitals
      logo.svg                       # Tài nguyên logo mặc định
```

## 3. Các bước chạy dự án (từ đầu)


### Bước 1: Mở terminal tại thư mục gốc dự án

```bash
cd DA2
```

### Bước 2: Cài dependency cho backend

```bash
cd backend
npm install
```

### Bước 3: Import cơ sở dữ liệu bằng phpMyAdmin

Thực hiện như sau:
1. Mở phpMyAdmin.
2. Vào tab `Import`.
5. Chọn file SQL knowledge_arena.sql đã được cung cấp.
6. Nhấn `Go` để import.

Thông số backend đang dùng mặc định:
- Database: `knowledge_arena`
- User: `root`
- Password: rỗng
- Host: `localhost`
- Port: `3306`

Lưu ý:
- Hãy đảm bảo file SQL đã chứa đầy đủ cấu trúc bảng và dữ liệu ban đầu (đặc biệt là bảng câu hỏi).
- Nếu user `root` trên máy người dùng có mật khẩu, cần cập nhật cấu hình kết nối trong backend cho phù hợp.

### Bước 4: Chạy backend server

```bash
cd backend
node server.js
```

Nếu thành công, terminal backend sẽ hiện thông báo server đang chạy ở cổng `4000`.

### Bước 5: Cài dependency cho frontend (terminal mới)

Mở terminal thứ 2:

```bash
cd DA2/frontend
npm install
```

### Bước 6: Chạy frontend

```bash
cd DA2/frontend
npm start
```

Sau đó mở trình duyệt tại:

```text
http://localhost:3000
```

## 4. Thứ tự khởi động mỗi lần sử dụng

Mỗi lần chạy lại dự án, chỉ cần:


```bash
cd DA2/backend
node server.js
```

Chạy frontend ở terminal khác:

```bash
cd DA2/frontend
npm start
```

## 5. Các lỗi thường gặp

- Lỗi kết nối DB: kiểm tra MySQL đã mở chưa, DB `knowledge_arena` đã tạo chưa, tài khoản `root` có mật khẩu khác rỗng hay không.
- Frontend không gọi được backend: đảm bảo backend đang chạy cổng `4000`.
- Vào được game nhưng không có câu hỏi: cần bổ sung dữ liệu bảng `Questions`.

