# 📚 Document Analyzer Feature - Project Documentation

**Status:** Ready for Development  
**Last Updated:** 2026-06-16  
**Repository:** `d:\smartcalendar\`  
**Feature Branch:** `feature/document-analyzer-learning` (tách từ `dev`)  
**Current Working Branch:** `dev`  

---

## 🎯 QUICK START (5 phút đọc)

Bạn có **5 tài liệu toàn diện** hướng dẫn phát triển:

### 1. **FEATURE_SPEC.md** (15 phút đọc)
   - **Nội dung:** Full feature specification, data models, workflow
   - **Đọc khi:** Muốn hiểu big picture và scope
   - **Đặc biệt:** Codebase hiện tại đã có gì, cần thêm gì

### 2. **TASK_BREAKDOWN.md** (20 phút đọc)
   - **Nội dung:** 7 work streams song song (A-H), code examples chi tiết
   - **Đọc khi:** Chuẩn bị code với AI agent
   - **Đặc biệt:** Code snippets match với codebase thực tế

### 3. **ARCHITECTURE.md** (25 phút đọc)
   - **Nội dung:** Quyết định kỹ thuật, implementation patterns
   - **Đọc khi:** Cần hiểu TẠI SAO các quyết định được đưa ra
   - **Đặc biệt:** GeminiAgent.run() signature thực tế, Gemini REST API format

### 4. **BRANCHING_STRATEGY.md** (10 phút đọc)
   - **Nội dung:** Git workflow, branch naming conventions
   - **Đọc khi:** Setup git branches
   - **Đặc biệt:** Base branch là `dev`, không phải `main`

### 5. **PROMPTS_FOR_OPENCODE.md** (Copy-paste ready)
   - **Nội dung:** Prompts đã viết sẵn cho mỗi stream (A-H)
   - **Đọc khi:** Sẵn sàng code với AI agent

---

## 🚀 HOW TO USE THESE DOCUMENTS

### **Cho Planning**
1. Đọc FEATURE_SPEC.md (Executive Summary)
2. Đọc TASK_BREAKDOWN.md (hiểu parallel work streams)
3. Tạo git feature branch: `git checkout dev && git checkout -b feature/document-analyzer-learning`

### **Cho Development**
1. Tạo sub-branch cho Stream A: `feature/document-analyzer/A-types`
2. Copy prompt từ PROMPTS_FOR_OPENCODE.md → Stream A section
3. Bắt đầu AI coding session với prompt đó
4. Lặp lại cho các streams khác song song
5. Merge tất cả streams vào main feature branch

### **Cho Code Review**
1. Reference ARCHITECTURE.md cho design justification
2. Check FEATURE_SPEC.md cho success criteria
3. Run: `npm run build` trong `d:\smartcalendar\`

---

## 📋 DOCUMENT MAP

```
FEATURE_SPEC.md
├── Executive Summary (problem + solution + codebase hiện tại)
├── Architecture Overview (data flow với references code thực)
├── Feature Specifications (7 components cần tạo/extend)
├── Vault Structure (folder organization)
├── Workflow & UX (user experience flows)
├── Success Criteria (measurable goals)
└── References (links to actual source files)

TASK_BREAKDOWN.md
├── Work Stream Overview (7 parallel streams)
├── Detailed Tasks (A-H với code examples match codebase)
├── Parallelization Strategy (optimal execution order)
├── Merge Strategy (dependency order)
└── Success Checklist (final verification)

ARCHITECTURE.md
├── Design Philosophy (5 core principles)
├── Class Hierarchy (classes mới + extended — với actual code)
├── Data Models (interfaces thực tế)
├── Gemini API Integration (format đúng — REST, không phải Anthropic)
├── JSONL Strategy (why append-only log)
├── Pattern Calculation (learning algorithm)
├── Enriched Prompts (context injection)
├── Safety & Confirmation (confirmAnalysis() extension)
├── Performance (optimization notes)
├── Testing Strategy (manual QA checklist)
└── Deployment (versioning: 0.0.1 → 1.0.0)

BRANCHING_STRATEGY.md
├── Quick Start (copy-paste git commands từ dev branch)
├── Branch Structure (main + sub-branches từ dev)
├── Linear vs Parallel Workflow (Option 1 vs 2)
├── Merge Order (dependencies between streams)
├── Conflict Resolution (CalendarTools.ts conflicts thường gặp)
├── Commit Conventions (conventional commits)
├── PR Template (pull request format cho dev→main)
└── Useful Commands (git reference)

PROMPTS_FOR_OPENCODE.md
├── General Setup (context cho tất cả sessions — repo path, branch)
├── Stream A (types.ts - FOUNDATION)
├── Stream B.1 (GeminiAgent multimodal)
├── Stream B.2 (CalendarTools new tools)
├── Stream C (AnalysisHistory JSONL)
├── Stream D (DocumentAnalyzer main logic)
├── Stream E (WorkCategoryConfig + prompts)
├── Stream F (UI components)
├── Stream G (Settings + Integration)
└── Stream H (Testing)
```

---

## 🔄 DEVELOPMENT WORKFLOW

### Step 1: Setup Git (5 phút)
```bash
cd d:\smartcalendar

# Đảm bảo đang ở dev branch (branch gốc)
git checkout dev
git pull origin dev

# Tạo feature branch
git checkout -b feature/document-analyzer-learning
git push -u origin feature/document-analyzer-learning

# Tạo sub-branches (cho parallel streams)
git checkout -b feature/document-analyzer/A-types
git push -u origin feature/document-analyzer/A-types
# ... repeat cho B, C, D, E, F, G, H
```

### Step 2: Bắt đầu Stream A (1-2h)
```bash
git checkout feature/document-analyzer/A-types

# Copy prompt từ PROMPTS_FOR_OPENCODE.md section "STREAM A"
# Bắt đầu AI coding session với prompt đó
# Sau khi xong:

git add src/types.ts
git commit -m "feat(A): add WorkCategory enum and DocumentAnalysis interfaces"
git push
```

### Step 3: Song song Sessions (sau Stream A xong)
```bash
# Session 2: Stream E (độc lập sau A)
git checkout feature/document-analyzer-learning
git checkout -b feature/document-analyzer/E-work-categories

# Session 3: Stream B.1 (sau A)
git checkout feature/document-analyzer-learning
git checkout -b feature/document-analyzer/B-gemini-extend

# Session 4: Stream C (sau A)
git checkout feature/document-analyzer-learning
git checkout -b feature/document-analyzer/C-analysis-history
```

### Step 4: Verify & Merge
```bash
cd d:\smartcalendar
npm run build
# → Phải succeed

# Merge theo dependency order (xem BRANCHING_STRATEGY.md)
git checkout feature/document-analyzer-learning
git merge feature/document-analyzer/A-types
# ... etc
```

### Step 5: Final Integration
```bash
npm run build
# main.js phải < 200KB

# Test trong Obsidian
# Sau khi OK:
git checkout dev
git merge feature/document-analyzer-learning
git push origin dev

# Sau khi test trên dev xong:
git checkout main
git merge dev
# Cập nhật manifest.json: version → "1.0.0"
git commit -m "chore: bump version to 1.0.0"
git tag v1.0.0
git push origin main --tags
```

---

## ⏱️ ESTIMATED TIMELINE

**Với parallel AI sessions:**

| Phase | Streams | Time | Status |
|-------|---------|------|--------|
| **Phase 1** | A (types) | 1-2h | Start immediately |
| **Phase 2** | E, B.1, C (parallel) | 3-5h | After Phase 1 |
| **Phase 3** | B.2, D (parallel) | 5-8h | After Phase 2 |
| **Phase 4** | F (UI) | 5-6h | After Phase 3 |
| **Phase 5** | G (Integration) | 3-4h | After Phase 4 |
| **Phase 6** | H (Testing) | 2-4h | After Phase 5 |
| **Total** | — | **~18-22h** | **1-2 weeks** |

**Wall clock với full parallelization: ~8-10 giờ**

---

## ✅ BEFORE YOU START

### Prerequisites:
- [ ] Node.js + npm installed
- [ ] Repository đã có tại: `d:\smartcalendar\`
- [ ] `npm install && npm run build` thành công
- [ ] Git configured
- [ ] Gemini API key (AI Studio)
- [ ] Google OAuth credentials (Client ID + Secret)

### Verify:
```bash
cd d:\smartcalendar
npm install
npm run build
# → Should succeed, output main.js (~111KB)

git status
# → Trên branch "dev", working tree clean

git log --oneline -3
# → Xem latest commits
```

### Understanding:
- [ ] Đọc FEATURE_SPEC.md Executive Summary
- [ ] Hiểu 6 work categories (Vietnamese government context)
- [ ] Biết JSONL format là gì
- [ ] Hiểu Gemini Vision API basics

---

## 🤖 AI CODING BEST PRACTICES

### Cho Mỗi Session:

1. **Set Context First**
   - Copy "General Setup Instruction" từ PROMPTS_FOR_OPENCODE.md
   - Paste stream-specific prompt
   - Cho AI đọc và hiểu codebase patterns trước

2. **Verify Pattern Match**
   - AI phải follow existing patterns trong codebase
   - Ví dụ: executor pattern trong CalendarTools.ts
   - Ví dụ: `requestUrl` thay vì `fetch` trong GeminiAgent.ts

3. **Build After Each Stream**
   - `npm run build` sau khi xong mỗi stream
   - Fix TypeScript errors ngay lập tức
   - Không để errors tích lũy

4. **Commit Often**
   - Commit sau mỗi 30-60 phút
   - Small commits = easier rollback

5. **Reference Exact Signatures**
   - Luôn reference GeminiAgent.run() signature thực tế (7 params)
   - Luôn reference CalendarTools executor pattern thực tế
   - Xem TASK_BREAKDOWN.md cho code examples chính xác

---

## 🧪 TESTING CHECKLIST (Per Stream)

```bash
# 1. TypeScript compilation
cd d:\smartcalendar
npm run build
# → Phải succeed hoàn toàn không có errors

# 2. Verify new files
ls d:\smartcalendar\src\  
# → Phải thấy files mới (AnalysisHistory.ts, DocumentAnalyzer.ts, etc.)

# 3. Check bundle size
ls -la d:\smartcalendar\main.js
# → < 200KB

# 4. Test trong Obsidian
# → Load plugin, check console (F12)
# → Không có "TypeError" hay "Module not found"
```

---

## 🐛 TROUBLESHOOTING

### **Build fails với "Cannot find module"**
- Verify import paths trong new files
- Check exports trong types.ts
- Run: `npm install` lại

### **TypeScript errors về missing types**
- Đảm bảo Stream A (types.ts) done trước
- Tất cả files import từ `./types` đúng
- Check WorkCategory enum được export

### **JSONL file issues**
- JSONL là append-only — không edit trực tiếp
- Nếu corrupted: dùng git để revert
- Implement error handling để skip bad lines

### **Gemini Vision không hoạt động**
- Check `inlineData.mimeType` đúng format
- Verify base64 không có `data:image/...;base64,` prefix
- Test với ảnh nhỏ (<1MB) trước

### **CalendarTools tool không được đăng ký**
- Kiểm tra executor đã thêm vào `this.executors = { ... }` trong constructor
- Kiểm tra tool declaration trong `getGeminiToolDeclarations()`
- Restart plugin sau khi build

---

## 🎯 SUCCESS CRITERIA (Final Checklist)

Trước khi declare "DONE":

- [ ] All 8 streams completed (A-H)
- [ ] `npm run build` → ✓ không errors
- [ ] Bundle size < 200KB
- [ ] Zero TypeScript strict mode errors
- [ ] Zero console warnings/errors khi load
- [ ] Command "Phân tích tài liệu" hoạt động
- [ ] OCR hoạt động với ảnh thật
- [ ] Category classification đúng
- [ ] Review modal hiển thị đầy đủ
- [ ] Google Tasks được tạo
- [ ] Vault notes được tạo
- [ ] JSONL history appending correctly
- [ ] InsightsDashboard hiển thị stats
- [ ] Settings page có options mới
- [ ] manifest.json version: `1.0.0`
- [ ] README.md updated
- [ ] Git tag: `v1.0.0`
- [ ] Merged: `feature/document-analyzer-learning` → `dev` → `main`

---

## 📚 RELATED DOCUMENTATION

### Inside Repository:
- [`README.md`](../README.md) — Main plugin documentation
- [`manifest.json`](../manifest.json) — Plugin metadata (version 0.0.1)
- [`package.json`](../package.json) — Dependencies + build scripts
- [`src/*.ts`](../src/) — Source files để reference patterns
- [`styles.css`](../styles.css) — CSS (~37KB, add styles mới vào đây)

### External:
- [Obsidian Plugin API](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [Gemini API Docs](https://ai.google.dev/) — REST API, multimodal
- [Google Tasks API](https://developers.google.com/tasks)
- [JSON Lines Format](http://jsonlines.org/)

---

## 🎓 LEARNING PATH (Nếu mới với Plugin Development)

1. **Day 1:** Đọc FEATURE_SPEC.md, hiểu requirements và codebase hiện tại
2. **Day 2:** Đọc ARCHITECTURE.md, hiểu design decisions
3. **Day 3:** Review code thực tế trong `src/GeminiAgent.ts` và `src/CalendarTools.ts`
4. **Day 4+:** Bắt đầu với Stream A, để AI guide qua phần còn lại

---

**Document Version:** 2.0 (updated to match actual codebase)  
**Created:** 2026-06-16  
**Total Files:** 6 (this README + 5 main docs)  
**Next Step:** Start Stream A với AI coding session
