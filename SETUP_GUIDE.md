# Hướng dẫn thiết lập Google Cloud & Gemini API cho Calendar Agent

Để plugin hoạt động, bạn cần cung cấp các thông tin xác thực (Credentials) từ Google. Hãy thực hiện theo các bước sau:

## 1. Thiết lập Google Cloud Project (Cho Calendar & Tasks)

### Bước 1: Tạo Project
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Nhấn vào danh sách project (góc trên bên trái) $\rightarrow$ **New Project**.
3. Đặt tên project (ví dụ: `My Obsidian Calendar Agent`) $\rightarrow$ **Create**.

### Bước 2: Bật các API cần thiết
Bạn cần bật 2 API sau để AI có thể đọc/ghi dữ liệu:
1. Tại thanh tìm kiếm, gõ **"Google Calendar API"** $\rightarrow$ Chọn kết quả $\rightarrow$ Nhấn **Enable**.
2. Tiếp tục tìm **"Google Tasks API"** $\rightarrow$ Chọn kết quả $\rightarrow$ Nhấn **Enable**.

### Bước 3: Cấu hình OAuth Consent Screen (Màn hình đồng ý)
Vì đây là app cá nhân, bạn cần cấu hình để Google cho phép bạn tự đăng nhập:
1. Vào **APIs & Services** $\rightarrow$ **OAuth consent screen**.
2. Chọn **User Type**: `External` $\rightarrow$ **Create**.
3. Điền các thông tin bắt buộc:
    - **App name**: `Calendar Agent`
    - **User support email**: Email của bạn.
    - **Developer contact information**: Email của bạn.
4. Nhấn **Save and Continue** qua các bước tiếp theo (không cần thêm Scope ở đây vì plugin sẽ yêu cầu khi chạy).
5. **QUAN TRỌNG**: Tại mục "Test users", hãy nhấn **+ ADD USERS** và thêm chính email Google của bạn vào. Nếu không, bạn sẽ bị báo lỗi "App not verified" khi login.

### Bước 4: Tạo OAuth 2.0 Client IDs
1. Vào **APIs & Services** $\rightarrow$ **Credentials**.
2. Nhấn **+ Create Credentials** $\rightarrow$ **OAuth client ID**.
3. Chọn **Application type**: `Desktop app`.
4. Đặt tên (ví dụ: `Obsidian Client`) $\rightarrow$ **Create**.
5. Bạn sẽ nhận được **Client ID** và **Client Secret**. Hãy copy 2 mã này.

---

## 2. Thiết lập Gemini API Key (Cho AI)

1. Truy cập [Google AI Studio](https://aistudio.google.com/).
2. Đăng nhập bằng tài khoản Google của bạn.
3. Nhấn vào **Get API key** (góc trên bên trái).
4. Nhấn **Create API key in new project** $\rightarrow$ Copy mã API Key này.

---

## 3. Cấu hình trong Obsidian

1. Mở **Settings** của plugin Calendar Agent.
2. Điền các thông tin vừa lấy được:
    - `Gemini API Key`: Dán mã từ AI Studio.
    - `Google Client ID`: Dán mã từ Google Cloud.
    - `Google Client Secret`: Dán mã từ Google Cloud.
    - `Inbox Folder`: Đường dẫn folder bạn dùng để chứa note hỗn loạn (ví dụ: `Inbox`).
3. **Kích hoạt quyền truy cập**:
    - Chạy lệnh: `Calendar Agent: Generate Google OAuth URL`.
    - Một trình duyệt sẽ mở ra $\rightarrow$ Đăng nhập bằng email của bạn $\rightarrow$ Nhấn "Continue" (kể cả khi Google cảnh báo app chưa xác minh).
    - Sau khi thành công, bạn sẽ thấy một URL hoặc mã code. Copy toàn bộ URL đó.
    - Chạy lệnh: `Calendar Agent: Exchange OAuth Code` $\rightarrow$ Dán URL/mã vừa copy vào $\rightarrow$ OK.

**Bây giờ bạn đã có thể bắt đầu Test!**