# 🌳 BRANCHING STRATEGY & GIT WORKFLOW

**Purpose:** Clear workflow cho phát triển song song + merging  
**Strategy:** Git Flow với feature branches  
**Main Branches:** `main` (stable release), `dev` (integration — **branch hiện tại**)  

> ⚠️ **Lưu ý:** Branch hiện tại là `dev`. Tất cả feature branches phải tách ra từ `dev`, không phải `main`.

---

## QUICK START

```bash
# 1. Đảm bảo bạn đang ở dev và up to date
git checkout dev
git pull origin dev

# 2. Tạo feature branch từ dev
git checkout -b feature/document-analyzer-learning

# 3. Tạo sub-branches cho mỗi stream (nếu làm song song)
git checkout -b feature/document-analyzer/A-types
git checkout -b feature/document-analyzer/B-gemini-extend
git checkout -b feature/document-analyzer/C-analysis-history
# ... etc

# 4. Push branches
git push --set-upstream origin feature/document-analyzer-learning
git push --set-upstream origin feature/document-analyzer/A-types
```

---

## BRANCH STRUCTURE

### Main Feature Branch
```
feature/document-analyzer-learning
├── Tách từ: dev
├── Tất cả sub-work merge vào đây
└── Merge vào dev sau khi test xong (không phải main trực tiếp)
```

### Sub-Feature Branches (Optional, cho parallel work)

Mỗi work stream có branch riêng:

```
feature/document-analyzer/
├── A-types/                    ← Stream A: types.ts
├── B-gemini-extend/            ← Stream B.1: GeminiAgent
├── B-calendar-tools/           ← Stream B.2: CalendarTools
├── C-analysis-history/         ← Stream C: AnalysisHistory
├── D-document-analyzer/        ← Stream D: DocumentAnalyzer
├── E-work-categories/          ← Stream E: WorkCategoryConfig
├── F-safety-layer/             ← Stream F.1: SafetyLayer
├── F-insights-dashboard/       ← Stream F.2: InsightsDashboard
├── G-settings-integration/     ← Stream G: Settings + main.ts
└── H-testing/                  ← Stream H: Tests
```

---

## DETAILED WORKFLOW

### OPTION 1: Linear (Đơn giản hơn, Sequential)

Dùng **single feature branch**, work tuần tự:

```bash
# Tạo feature branch từ dev
git checkout dev
git checkout -b feature/document-analyzer-learning

# Stream A: Sửa types.ts
git add src/types.ts
git commit -m "feat: add DocumentAnalysis interfaces to types.ts"

# Stream B: Sửa GeminiAgent.ts
git add src/GeminiAgent.ts
git commit -m "feat: extend GeminiAgent for multimodal input"

# Stream C: Tạo files mới
git add src/AnalysisHistory.ts src/DocumentAnalyzer.ts
git commit -m "feat: add DocumentAnalyzer and AnalysisHistory classes"

# Push khi xong
git push origin feature/document-analyzer-learning
```

**Pros:**
- Đơn giản, dễ quản lý
- Một PR để review

**Cons:**
- Không song song được
- Commits dồn lại

---

### OPTION 2: Parallel (Recommended cho AI-assisted coding)

Dùng **separate branches per stream**, sau đó merge vào main feature branch:

```bash
# Tạo integration branch từ dev
git checkout dev
git checkout -b feature/document-analyzer-learning
git push -u origin feature/document-analyzer-learning

# Stream A (bắt đầu ngay)
git checkout -b feature/document-analyzer/A-types
# ... edit src/types.ts
git add src/types.ts
git commit -m "feat(A): add WorkCategory enum and DocumentAnalysis interfaces"
git push -u origin feature/document-analyzer/A-types

# Stream E (song song với A, độc lập)
git checkout feature/document-analyzer-learning
git checkout -b feature/document-analyzer/E-work-categories
# ... tạo src/WorkCategoryConfig.ts
git add src/WorkCategoryConfig.ts
git commit -m "feat(E): add WorkCategoryConfig with 6 domain categories"
git push -u origin feature/document-analyzer/E-work-categories

# ... các streams khác tương tự
```

**Pros:**
- Thực sự song song
- Mỗi AI session độc lập
- Commit history rõ ràng per stream

**Cons:**
- Nhiều branches cần quản lý
- Cần xử lý merge conflicts cẩn thận

---

## MERGE ORDER (Nếu dùng Option 2)

**Tôn trọng dependencies**, merge theo thứ tự sau:

```
Phase 1: Foundation (BẮT BUỘC làm trước)
└── A-types
    └─ into: feature/document-analyzer-learning

Phase 2: Independent modules (sau A)
├── E-work-categories  → feature/document-analyzer-learning
├── B-gemini-extend    → feature/document-analyzer-learning
└── C-analysis-history → feature/document-analyzer-learning

Phase 3: Phụ thuộc Phase 2
├── B-calendar-tools (cần B-gemini-extend)
│   └─ into: feature/document-analyzer-learning
└── D-document-analyzer (cần A, B, C, E)
    └─ into: feature/document-analyzer-learning

Phase 4: UI (cần D)
├── F-safety-layer  → feature/document-analyzer-learning
└── F-insights-dashboard → feature/document-analyzer-learning

Phase 5: Integration (cần F, E)
└── G-settings-integration → feature/document-analyzer-learning

Phase 6: Testing (cần G)
└── H-testing → feature/document-analyzer-learning

Final: Merge vào dev
└── feature/document-analyzer-learning → dev
```

---

## HANDLING MERGE CONFLICTS

### Conflict thường gặp trong CalendarTools.ts

Vì nhiều streams đều sửa `CalendarTools.ts` (thêm executors):

```typescript
// Conflict example:
const executors: Record<string, ToolExecutor> = {
  // ... existing executors ...
  
<<<<<<< HEAD (feature/document-analyzer-learning)
  analyze_document_image: async (args) => { ... },  // từ B-gemini
=======
  create_task_from_analysis: async (args) => { ... },  // từ B-calendar-tools
>>>>>>> feature/document-analyzer/B-calendar-tools
};
```

**Resolution:**
```typescript
const executors: Record<string, ToolExecutor> = {
  // ... existing 14 executors ...
  analyze_document_image: async (args) => { ... },       // từ B-gemini
  create_task_from_analysis: async (args) => { ... },    // từ B-calendar
  create_event_from_analysis: async (args) => { ... },   // từ B-calendar
};
```

Sau đó:
```bash
git add src/CalendarTools.ts
git commit -m "merge: resolve CalendarTools conflict — combine executor additions"
git push origin feature/document-analyzer-learning
```

### Conflict thường gặp trong types.ts

```bash
# Thường là thêm interfaces mới không xung đột nhau
# Resolution: giữ cả hai phần thêm vào
```

### Conflict trong main.ts

```typescript
// main.ts conflict khi G-settings-integration merge
<<<<<<< HEAD
  this.analysisHistory = new AnalysisHistory(this);
=======
  this.insightsDashboard = new InsightsDashboard(this);
>>>>>>> feature/document-analyzer/G-settings-integration

// Resolution: giữ cả hai
  this.analysisHistory = new AnalysisHistory(this);
  this.insightsDashboard = new InsightsDashboard(this);
```

---

## COMMIT MESSAGE CONVENTIONS

Dùng **conventional commits**:

```bash
# Feature
git commit -m "feat: add DocumentAnalyzer class"
git commit -m "feat(A): add WorkCategory enum to types.ts"
git commit -m "feat(B): extend GeminiAgent.run() with imageBase64 param"

# Bug fix
git commit -m "fix: handle OCR errors gracefully in DocumentAnalyzer"

# Refactor
git commit -m "refactor: extract pattern calculation to helper functions"

# Tests
git commit -m "test: add unit tests for AnalysisHistory.logAnalysis()"

# Merge
git commit -m "merge: combine Stream B-gemini-extend into integration branch"

# Chore
git commit -m "chore: bump manifest.json version to 1.0.0"
```

**Format:** `<type>(<scope>): <subject>`

---

## PULL REQUEST TEMPLATE

Khi tạo PR từ `feature/document-analyzer-learning` → `dev`:

```markdown
## Description
Implements Document Analyzer feature với self-learning system (Streams A-H).

## What Changed
- [ ] types.ts: thêm WorkCategory enum + DocumentAnalysis interfaces
- [ ] GeminiAgent.ts: hỗ trợ multimodal (imageBase64 param)
- [ ] CalendarTools.ts: thêm 3 executors (analyze_document, create_task/event_from_analysis)
- [ ] NEW: AnalysisHistory.ts (JSONL storage + pattern calculation)
- [ ] NEW: DocumentAnalyzer.ts (main logic)
- [ ] NEW: WorkCategoryConfig.ts (6 domain categories)
- [ ] SafetyLayer.ts: thêm confirmAnalysis() method
- [ ] NEW: InsightsDashboard.ts (Obsidian ItemView)
- [ ] SettingsTab.ts: thêm Work Categories + Learning settings
- [ ] main.ts: khởi tạo tất cả services mới

## Testing Done
- [ ] npm run build thành công
- [ ] Không có TypeScript errors
- [ ] Load plugin trong Obsidian — không có console errors
- [ ] Test với 5+ tài liệu thật
- [ ] Verify JSONL history appends correctly
- [ ] Verify SafetyLayer review modal hiển thị đúng

## Checklist
- [ ] Code reviewed
- [ ] manifest.json version bumped (0.0.1 → 1.0.0)
- [ ] README.md cập nhật với tính năng mới
```

---

## GIT WORKFLOW SUMMARY

### Step 1: Setup (Trước khi bắt đầu)
```bash
# Đảm bảo đang ở dev
git checkout dev
git pull origin dev

# Tạo feature branch
git checkout -b feature/document-analyzer-learning
git push -u origin feature/document-analyzer-learning
```

### Step 2: Tạo sub-branches (Option 2)
```bash
# Từ feature/document-analyzer-learning, tạo branches cho mỗi stream
git checkout feature/document-analyzer-learning
git checkout -b feature/document-analyzer/A-types
git push -u origin feature/document-analyzer/A-types

git checkout feature/document-analyzer-learning
git checkout -b feature/document-analyzer/B-gemini-extend
git push -u origin feature/document-analyzer/B-gemini-extend

# ... lặp lại cho C, D, E, F, G, H
```

### Step 3: Parallel Work
```bash
# Mỗi AI session làm trên branch riêng của mình:
git checkout feature/document-analyzer/A-types
# ... edit src/types.ts
git add src/types.ts
git commit -m "feat(A): extend types.ts with DocumentAnalysis interfaces"
git push
```

### Step 4: Merge Streams
```bash
git checkout feature/document-analyzer-learning

# Theo thứ tự dependency:
git merge feature/document-analyzer/A-types
git merge feature/document-analyzer/E-work-categories
git merge feature/document-analyzer/B-gemini-extend
git merge feature/document-analyzer/C-analysis-history
git merge feature/document-analyzer/B-calendar-tools
git merge feature/document-analyzer/D-document-analyzer
git merge feature/document-analyzer/F-safety-layer
git merge feature/document-analyzer/F-insights-dashboard
git merge feature/document-analyzer/G-settings-integration
git merge feature/document-analyzer/H-testing

# Giải quyết conflicts nếu có
git push origin feature/document-analyzer-learning
```

### Step 5: Build & Test
```bash
cd d:\smartcalendar
npm run build
# → Phải succeed không có errors

# Kiểm tra bundle size
# main.js phải < 200KB
```

### Step 6: Merge vào dev, rồi main
```bash
# Merge vào dev
git checkout dev
git merge feature/document-analyzer-learning
git push origin dev

# Sau khi test trên dev OK, merge vào main
git checkout main
git merge dev

# Cập nhật version
# Edit manifest.json: version → "1.0.0"
git add manifest.json
git commit -m "chore: bump version to 1.0.0 (Document Analyzer feature)"

# Tag release
git tag v1.0.0
git push origin main --tags

# Clean up feature branch
git branch -d feature/document-analyzer-learning
git push origin --delete feature/document-analyzer-learning
```

---

## USEFUL GIT COMMANDS

```bash
# Xem tất cả branches
git branch -a

# Xem branches đã merged
git branch --merged

# Xem branches chưa merged
git branch --no-merged

# Xóa local branch
git branch -d feature/document-analyzer/A-types

# Xóa remote branch
git push origin --delete feature/document-analyzer/A-types

# Xem commit history
git log feature/document-analyzer-learning --oneline

# Xem diff giữa branches
git diff dev...feature/document-analyzer-learning

# Abort merge nếu conflict quá phức tạp
git merge --abort

# Stash changes tạm thời
git stash
git stash pop
```

---

## REVERTING IF NEEDED

```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last merge commit
git revert -m 1 HEAD

# Reset branch về trạng thái clean
git reset --hard HEAD

# Force push (careful!)
git push -f origin feature/document-analyzer-learning
```

---

## COLLABORATION NOTES

### Cho Single Developer (Mặc định)
- Option 1 (Linear) nếu làm tuần tự
- Option 2 nếu dùng nhiều AI sessions song song

### Environment
- Working directory: `d:\smartcalendar`
- Node.js version: >= 18 (theo tsconfig.json target ES2020)
- Build command: `npm run build`
- Dev command: không applicable (đây là Obsidian plugin, không có dev server)

---

**Document Version:** 2.0 (updated to match actual codebase)  
**Last Updated:** 2026-06-16  
**Key Changes từ v1.0:**
- Base branch là `dev` thay vì `main`
- Working directory là `d:\smartcalendar` (không phải `d:\obi-calendar`)
- Version target: `1.0.0` thay vì `2.0.0`
- Merge flow: feature → dev → main (2 bước)
