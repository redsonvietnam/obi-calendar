# Obi Calendar (Obsidian Calendar Agent)

AI Calendar Assistant for Obsidian, tích hợp **Gemini Function Calling** + **Google Calendar API** để bạn chat và quản lý lịch trực tiếp trong Obsidian.

---

## 1) Mục tiêu dự án

`obi-calendar` giúp bạn:

- Không cần nhảy qua lại giữa Obsidian và Google Calendar.
- Quản lý lịch bằng ngôn ngữ tự nhiên (tiếng Việt/Anh).
- Có cả **chat assistant** và **calendar view** trong cùng sidebar của Obsidian.
- Tăng năng suất cho workflow ghi chú + task + lịch làm việc cá nhân.

---

## 2) Những gì đã hoàn thành

## 2.1 Core plugin structure

- Plugin TypeScript cho Obsidian đã chạy ổn định.
- Build bằng `esbuild`.
- Settings / loadData / saveData hoàn chỉnh.
- Sidebar view riêng: `obsidian-calendar-agent-view`.

## 2.2 OAuth Google Calendar

- Tạo URL OAuth để login Google.
- Exchange authorization code để lấy token.
- Refresh access token tự động qua `OAuthManager`.
- Có command test luồng OAuth trong Obsidian Commands.

## 2.3 Google Calendar API layer

Đã có wrapper class `GoogleCalendarAPI` với các function:

- `listEvents`
- `getEvent`
- `createEvent`
- `updateEvent`
- `patchEvent`
- `deleteEvent`

Có validation payload và normalize lỗi API để debug dễ.

## 2.4 Gemini Agent + Tool Calling

- `GeminiAgent` gọi model và chạy tool calling.
- `CalendarTools` bridge từ AI -> Google Calendar actions.
- Có trace tool calls để theo dõi AI đã gọi gì, thành công/thất bại ra sao.

## 2.5 Safety & Context

- `SafetyLayer` hỗ trợ thao tác an toàn, có khả năng undo mutation gần nhất.
- `VaultContext` lấy context từ Obsidian vault (daily notes, tasks, projects...) để AI hiểu ngữ cảnh tốt hơn.

## 2.6 UI nâng cấp lớn (latest)

Đã triển khai giao diện hiện đại gồm:

### Chat UI (Gemini/ChatGPT-inspired)

- Bubble chat rõ vai trò: User / Assistant / Tool.
- Composer mới (textarea + send button + loading/disabled state).
- Quick prompts:
  - Lịch hôm nay
  - 5 sự kiện tới
  - Tuần này
- Status bar + empty state trực quan.

### Calendar UI (Google Calendar-style trong plugin)

- Tab chuyển đổi: **Chat** / **Calendar**.
- **Month view** dạng grid 7 cột (T2 -> CN), 42 ô chuẩn tháng.
- Nút điều hướng: Previous / Today / Next / Reload.
- Dot indicators hiển thị ngày có sự kiện.
- Click ngày để xem danh sách sự kiện chi tiết ngay bên dưới.
- Tự reload calendar sau mỗi thao tác chat có tool execution.

### Styling

- File `styles.css` riêng cho plugin.
- Dùng CSS variables native của Obsidian (`--background-primary`, `--text-normal`, `--interactive-accent`...) nên tự thích nghi dark/light theme.

---

## 3) Cấu trúc chính của code

```text
src/
  main.ts                 # Entry plugin, register commands/view/settings
  CalendarView.ts         # UI Chat + Calendar tab
  GeminiAgent.ts          # Gọi Gemini + tool calling loop
  CalendarTools.ts        # Tool execution layer cho calendar actions
  GoogleCalendarAPI.ts    # HTTP wrapper cho Google Calendar API
  OAuthManager.ts         # OAuth flow + token lifecycle
  VaultContext.ts         # Snapshot ngữ cảnh từ vault
  SafetyLayer.ts          # Confirm/undo cho hành động mutation
  SettingsTab.ts          # UI cài đặt plugin
  types.ts                # Shared types/interfaces
styles.css                # UI style hiện đại cho chat + calendar
manifest.json             # Obsidian manifest
esbuild.config.mjs        # Build config
```

---

## 4) Cách chạy trong local

## 4.1 Cài dependencies

```bash
npm install
```

## 4.2 Build

```bash
npm run build
```

## 4.3 Deploy vào vault Obsidian

Copy các file sau vào thư mục plugin trong vault:

- `main.js`
- `manifest.json`
- `styles.css`

Ví dụ vault của chúng tôi:

```text
G:\My Drive\FezNote\.obsidian\plugins\obsidian-calendar-agent
```

Sau đó reload plugin trong Obsidian (tắt/bật lại) để nhận bản mới.

---

## 5) Command hữu ích trong Obsidian

- Open Calendar Agent Sidebar
- Calendar Agent: Generate Google OAuth URL
- Calendar Agent: Exchange OAuth Code
- Calendar Agent: Test list events (Google Calendar)
- Calendar Agent: Test Gemini Function Calling (hardcoded)
- Calendar Agent: Undo last calendar mutation
- Calendar Agent: Test vault context snapshot

---

## 6) Roadmap / Ý tưởng sắp tới

## 6.1 Calendar UX

- [ ] Week view dạng timeline.
- [ ] Day view chi tiết.
- [ ] Drag & drop reschedule event.
- [ ] Resize event block để đổi duration.
- [ ] Multi-calendar color mapping như Google Calendar.

## 6.2 Assistant UX

- [ ] Streaming token-by-token khi AI trả lời.
- [ ] Rich markdown rendering cho assistant message.
- [ ] Inline approve/deny cho thao tác mutation quan trọng.
- [ ] Prompt templates theo ngữ cảnh (work/personal/family).

## 6.3 Smart Context

- [ ] Deep link event <-> note trong Obsidian.
- [ ] Auto suggest slot trống dựa trên tasks + deadline.
- [ ] Sync daily note agenda từ calendar events.
- [ ] Prioritization engine cho “sự kiện nào quan trọng hôm nay”.

## 6.4 Reliability & Security

- [ ] Mã hóa token lưu local.
- [ ] Retry/backoff + rate-limit handling tốt hơn.
- [ ] Better telemetry/log panel cho debug.
- [ ] Test coverage (unit + integration) cho API/tools/agent loop.

## 6.5 Release/Distribution

- [ ] Chuẩn hóa release pipeline.
- [ ] Semantic versioning + changelog.
- [ ] Packaging để submit community plugin (nếu mục tiêu public).

---

## 7) Vision

Mục tiêu dài hạn là biến `obi-calendar` thành một **AI scheduling copilot** ngay trong Obsidian:

- hiểu ngữ cảnh ghi chú,
- nắm task và deadline,
- gợi ý lịch tối ưu,
- tự động hóa planning mà vẫn giữ kiểm soát cho người dùng.

---

## 8) Trạng thái hiện tại

**Status:** Working prototype mạnh + UI usable hàng ngày.  
**Next milestone:** Week/Day view + scheduling intelligence + production hardening.