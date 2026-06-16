# 📋 FEATURE SPEC: Document Analyzer with Self-Learning System

**Status:** Planning Phase  
**Feature Name:** Document Analysis & Self-Learning Work Assistant  
**Branch:** `feature/document-analyzer-learning` (from `dev`)  
**Target Completion:** 4-5 sprints (2-3 weeks)  
**Bundle Size Impact:** +8-12KB (hiện tại ~111KB main.js → ~120-125KB)  

---

## 1. EXECUTIVE SUMMARY

### Problem
- User nhận công văn, báo cáo, kế hoạch từ cấp trên
- Hiện tại: thủ công parse deadline, category, ước lượng effort → thêm vào Google Tasks
- Mong muốn: **Scan/upload tài liệu → AI phân tích + tự thêm vào Tasks/Calendar + học theo thời gian**

### Solution
Mở rộng plugin Obsidian Calendar Agent hiện có với:
1. **Document OCR + Analysis** via Gemini Vision (multimodal)
2. **Work Category Classification** (6 danh mục chuyên biệt)
3. **Self-Learning System** (JSONL-based history + pattern detection)
4. **Insights Dashboard** (theo dõi độ chính xác ước lượng, gợi ý cải thiện)
5. **Adaptive AI Prompting** (Gemini học từ lịch sử công việc của user)

### Codebase Hiện Tại (thực tế)
Repository: `d:\smartcalendar\`  
Plugin ID: `obsidian-calendar-agent`  
Version hiện tại: `0.0.1`  
Branch dev: `dev`  

**Files đã có:**
- `src/main.ts` — Entry point, khởi tạo tất cả services
- `src/GeminiAgent.ts` — AI engine (Gemini REST API với multi-model fallback)
- `src/CalendarTools.ts` — Tool registry (14 tools: Calendar CRUD + Tasks CRUD + Vault)
- `src/GoogleCalendarAPI.ts` — Google Calendar REST wrapper
- `src/GoogleTasksAPI.ts` — Google Tasks REST wrapper  
- `src/OAuthManager.ts` — Google OAuth PKCE flow
- `src/SafetyLayer.ts` — Confirmation modal + undo buffer
- `src/SyncManager.ts` — Bidirectional sync (Google ↔ Obsidian)
- `src/VaultContext.ts` — Vault snapshot (daily notes, open tasks, projects)
- `src/SettingsTab.ts` — Plugin settings UI
- `src/CalendarView.ts` — Chat sidebar UI
- `src/types.ts` — Type definitions + interfaces
- `styles.css` — Plugin CSS (~37KB)

---

## 2. TECHNICAL ARCHITECTURE

### 2.1 High-Level Diagram

```
User Input (Image/Scan) → Paste vào CalendarView chat
    ↓
[DocumentAnalyzer] (NEW)
    ├─ validateImageBase64()
    ├─ extractTextViaGemini()  ← gọi GeminiAgent.run() với imageBase64
    ↓
[GeminiAgent] (EXTEND — thêm imageBase64 vào parts[])
    ├─ run(userMessage, history, timezone, vaultSnapshot, signal, excludedTools, imageBase64?)
    ├─ parts[] = [{ text }, { inlineData: { mimeType, data: imageBase64 } }]
    ├─ Fallback: gemini-flash-latest → gemini-2.5-flash → ... (8 models)
    ↓
[Classify Work Category]
    ├─ Match keywords → WorkCategoryConfig
    ↓
[Estimate Effort + Extract Metadata]
    ├─ AnalysisHistory.getPatternsForCategory()
    ├─ Inject patterns vào enriched system prompt
    ↓
[SafetyLayer] (EXTEND — thêm confirmAnalysis())
    └─ Review Modal hiển thị:
        ├─ Job title, deadline, category
        ├─ Pattern insights ("Similar tasks took 5.2 days on avg")
        ├─ Action plan
        └─ [✅ Confirm] [✏️ Edit] [❌ Cancel]
        ↓
[CalendarTools] (EXTEND — thêm 3 executors)
    ├─ analyze_document_image  ← OCR + phân loại
    ├─ create_task_from_analysis  ← GoogleTasksAPI.createTask()
    ├─ create_event_from_analysis  ← GoogleCalendarAPI.createEvent()
    ↓
[AnalysisHistory] (NEW)
    ├─ Lưu: _document-analysis/metadata/analysis-history.jsonl
    ├─ Patterns: _document-analysis/patterns/[category].json
    └─ Vault notes: _document-analysis/by-date/YYYY-MM/[filename].md
        ↓
[Feedback Loop]
    ├─ SyncManager phát hiện task completed trong Google Tasks
    ├─ So sánh actual vs estimated
    ├─ AnalysisHistory.recordFeedback() → recalculate patterns
    └─ Lần phân tích sau dùng patterns tốt hơn
        ↓
[InsightsDashboard] (NEW — ItemView sidebar)
    └─ Thống kê + recommendations
```

### 2.2 Data Flow - Ví dụ Cụ thể

```
Input: User paste ảnh "Báo cáo quản lý tài sản quý 2"

1. DocumentAnalyzer.analyzeDocument(imageBase64)
   
2. GeminiAgent.run() với imageBase64 → Gemini Vision OCR:
   Output: "Báo cáo quản lý tài sản quý 2. Hạn: 30/6/2026"
   
3. ClassifyCategory():
   Matched: WorkCategory.PH10_ASSET_MANAGEMENT
   
4. AnalysisHistory.getPatternsForCategory(PH10):
   {
     totalAnalyzed: 12,
     avgDeadlineDays: 5.2,
     avgHours: 4.5,
     estimateAccuracy: 92%,
     commonKeywords: ["báo cáo", "tài sản", "quý", "kiểm kê"]
   }
   
5. GeminiAgent.run() với enriched prompt:
   System: "Dựa trên 12 báo cáo tài sản tương tự:
            - Deadline TB: 5.2 ngày
            - Effort TB: 4.5 giờ
            - Cảnh báo: nếu estimate lệch >20%, hãy nêu lý do"
   
6. Gemini output:
   {
     jobTitle: "Báo cáo quản lý tài sản quý 2",
     deadline: "2026-06-30",
     estimatedDays: 5,      ← matches pattern (5.2 → 5)
     estimatedHours: 4,     ← matches pattern (4.5 → 4)
     category: "PH10_ASSET_MANAGEMENT",
     keywords: ["báo cáo", "tài sản", "quý"],
     actionPlan: [
       "Kiểm tra hệ thống tài sản hiện có",
       "Thu thập thông tin từ các đơn vị",
       "Xây dựng bản báo cáo",
       "Review với PH10",
       "Nộp lên cấp trên"
     ],
     requiredApprovals: ["PH10_Manager"],
     riskLevel: "low"
   }
   
7. SafetyLayer.confirmAnalysis():
   ┌─────────────────────────────────────┐
   │ 📋 Báo cáo quản lý tài sản quý 2    │
   │ ⏰ Deadline: 30/6/2026 (5 ngày)      │
   │ 📁 PH10: Quản lý Tài sản            │
   │                                     │
   │ Pattern insight:                    │
   │ ✓ Similar tasks took 5.2 days on avg│
   │ Your estimate: 5 days (matches!)    │
   │                                     │
   │ Action Plan:                        │
   │ □ Kiểm tra hệ thống...             │
   │ □ Thu thập info...                 │
   │ □ Xây dựng báo cáo                 │
   │ □ Review với PH10                  │
   │ □ Nộp lên cấp trên                 │
   │                                     │
   │ [✅ Add to Calendar] [✏️ Edit] [❌] │
   └─────────────────────────────────────┘
   
8. User clicks [✅ Add to Calendar]
   
9. CalendarTools.execCreateTaskFromAnalysis():
   - GoogleTasksAPI.createTask() → Google Task: "Báo cáo quản lý tài sản quý 2"
   - Due: 2026-06-30
   - Notes: {metadata JSON với category, actionPlan, estimatedHours}
   - GoogleCalendarAPI.createEvent() → 5-day work block
   
10. AnalysisHistory.logAnalysis():
    Append to _document-analysis/metadata/analysis-history.jsonl:
    {
      "id": "uuid-20260616-001",
      "timestamp": "2026-06-16T10:30:00Z",
      "category": "PH10_ASSET_MANAGEMENT",
      "jobTitle": "Báo cáo quản lý tài sản quý 2",
      "detectedKeywords": ["báo cáo", "tài sản", "quý", "kiểm kê"],
      "estimatedDeadlineDays": 5,
      "estimatedHours": 4,
      "actionPlan": [...],
      "userFeedback": null,
      "notes": null
    }
    
11. (Sau này) User hoàn thành task trên Google Tasks:
    - SyncManager.syncTasks() phát hiện completed
    - Plugin ghi nhận: actualDeadlineDays: 6, actualHours: 3.5
    
12. AnalysisHistory.recordFeedback():
    Update analysis-history.jsonl với actual data
    Recalculate patterns cho PH10:
    {
      totalAnalyzed: 13,
      avgDeadlineDays: 5.15,  ← was 5.2, now 5.15
      avgHours: 4.42,         ← was 4.5, now 4.42
      estimateAccuracy: 93%   ← was 92%, improved
    }
    
13. Lần sau phân tích PH10 tương tự → plugin dùng patterns tốt hơn 🎯
```

---

## 3. FEATURE SPECIFICATIONS

### 3.1 Work Categories (6 Domain-Specific)

| ID | Category | Keywords | Default Deadline | Effort | Template |
|-----|----------|----------|------------------|--------|----------|
| PH10 | Quản lý Tài sản | tài sản, vũ khí, quân trang, cấp phát, báo cáo | 5 days | 4h | Asset audit workflow |
| PC06 | Cấp phép Vũ khí | cấp phép, đăng kí, giấy phép, hồ sơ, vũ khí | 10 days | 6h | License approval workflow |
| PV01 | Văn thư & Tham mưu | văn thư, công văn, tham mưu, viễn thông, cơ yếu | 3 days | 3h | Admin document workflow |
| DT | Chuyển đổi Số | chuyển đổi số, số hóa, hệ thống, ứng dụng, triển khai | 15 days | 16h | Transformation project workflow |
| NQ57 | Nghị Quyết 57 | NQ 57, phát triển CNTT, hạ tầng, dự toán | 20 days | 20h | Long-term IT development |
| ND85 | Nghị định 85 | ND 85, an toàn thông tin, cấp độ an toàn, bảo mật | 30 days | 24h | Info security compliance |

### 3.2 Core Components

#### A. DocumentAnalyzer.ts (NEW, ~280 lines)
```typescript
class DocumentAnalyzer {
  constructor(
    private geminiAgent: GeminiAgent,       // inject từ main.ts
    private analysisHistory: AnalysisHistory,
    private vaultContext: VaultContext,     // đã có trong main.ts
    private workCategoryConfig: WorkCategoryConfig
  ) {}

  // Main entry point — gọi từ command hoặc CalendarView
  async analyzeDocument(
    imageBase64: string, 
    userContext?: string
  ): Promise<DocumentAnalysisResult>;

  // Validate & strip data URL prefix nếu có
  private parseImageBase64(imageData: string): string;
  
  // OCR via GeminiAgent.run() với imageBase64 param mới
  private async extractTextViaGemini(imageBase64: string): Promise<string>;
  
  // Match keywords với WorkCategoryConfig
  private classifyWorkCategory(text: string): WorkCategory;
  
  // Inject pattern context vào system prompt
  private buildEnrichedPrompt(
    category: WorkCategory,
    patterns: PatternInsights,
    extractedText: string
  ): string;
  
  // Tạo vault note theo template
  private async saveAnalysisToVault(analysis: DocumentAnalysis): Promise<string>;
}
```

#### B. AnalysisHistory.ts (NEW, ~220 lines)
Quản lý JSONL append-only log + tính toán patterns.

```typescript
interface DocumentAnalysis {
  id: string;                          // UUID
  timestamp: string;                   // ISO string (tương thích với codebase)
  category: WorkCategory;              // enum
  jobTitle: string;
  detectedKeywords: string[];
  estimatedDeadlineDays: number;
  actualDeadlineDays?: number;         // Điền sau khi hoàn thành
  estimatedHours: number;
  actualHours?: number;
  actionPlan: string[];
  actionPlanEstimates?: Record<string, number>; // giờ mỗi bước
  requiredApprovals?: string[];
  riskLevel?: "low" | "medium" | "high";
  userFeedback?: "accurate" | "too_short" | "too_long";
  notes?: string;
  googleTaskId?: string;               // Link tới Google Task
  googleEventId?: string;              // Link tới Calendar Event
  vaultNoteId?: string;                // Path ghi chú vault
}

interface PatternInsights {
  totalAnalyzed: number;
  avgDeadlineDays: number;
  stdDevDays: number;
  avgHours: number;
  stdDevHours: number;
  estimateAccuracy: number;            // 0-100%
  commonKeywords: string[];
  frequentApprovers: string[];
  riskDistribution: Record<string, number>;
  lastUpdated: string;                 // ISO string
}

class AnalysisHistory {
  constructor(private plugin: ObsidianCalendarAgentPlugin) {}
  
  async logAnalysis(analysis: DocumentAnalysis): Promise<string>;
  async getHistoryByCategory(category: WorkCategory, limit?: number): Promise<DocumentAnalysis[]>;
  async getPatternsForCategory(category: WorkCategory): Promise<PatternInsights>;
  async recordFeedback(analysisId: string, actual: {
    deadlineDays: number;
    hours: number;
    feedback: "accurate" | "too_short" | "too_long";
  }): Promise<void>;
  async getAllAnalyses(): Promise<DocumentAnalysis[]>;
}
```

#### C. WorkCategoryConfig.ts (NEW, ~150 lines)
Định nghĩa 6 danh mục công việc với system prompts + templates.

#### D. GeminiAgent.ts (EXTEND, +15 lines)
Thêm `imageBase64?: string` vào `run()` — tích hợp vào `parts[]` array:

```typescript
// Signature hiện tại:
async run(
  userMessage: string,
  history: GeminiContent[],
  timezone: string,
  vaultSnapshot: string,
  signal?: AbortSignal,
  excludedTools?: string[]
): Promise<AgentRunResult & { updatedHistory: GeminiContent[] }>

// Signature mới (thêm imageBase64):
async run(
  userMessage: string,
  history: GeminiContent[],
  timezone: string,
  vaultSnapshot: string,
  signal?: AbortSignal,
  excludedTools?: string[],
  imageBase64?: string          // NEW: optional image cho Vision
): Promise<AgentRunResult & { updatedHistory: GeminiContent[] }>
```

Trong `buildUserParts()`:
```typescript
// Trước (chỉ text):
const parts: GeminiPart[] = [{ text: userMessage }];

// Sau (có thể kèm ảnh):
const parts: GeminiPart[] = [
  { text: userMessage },
  ...(imageBase64 ? [{ inlineData: { mimeType: "image/jpeg", data: imageBase64 } }] : [])
];
```

**Lưu ý**: GeminiPart interface đã có sẵn trong `types.ts` nhưng thiếu `inlineData` — cần thêm.

#### E. CalendarTools.ts (EXTEND, +80 lines)
Thêm 3 executors vào registry hiện có (executor pattern đã có sẵn):

```typescript
// Trong this.executors = { ... } của constructor:
analyze_document_image: this.execAnalyzeDocumentImage.bind(this),
create_task_from_analysis: this.execCreateTaskFromAnalysis.bind(this),
create_event_from_analysis: this.execCreateEventFromAnalysis.bind(this),
```

Và thêm tool declarations trong `getGeminiToolDeclarations()`.

#### F. SafetyLayer.ts (EXTEND, +70 lines)
`SafetyActionType` hiện có: `"create_event" | "update_event" | "delete_event" | "write_note"`

Thêm: `"analyze_document"` vào union type và method mới `confirmAnalysis()`.

#### G. types.ts (EXTEND, +60 lines)
Thêm interfaces:
- `DocumentAnalysisResult`
- `WorkCategoryConfig`
- `PatternInsights`
- `WorkCategory` enum
- Thêm `inlineData` vào `GeminiPart`

#### H. SettingsTab.ts (EXTEND, +40 lines)
Thêm settings section mới sau phần Sync settings hiện có.

---

## 4. VAULT STRUCTURE

Sau khi khởi tạo, plugin tạo:

```
vault_root/
└── _document-analysis/
    ├── metadata/
    │   ├── analysis-history.jsonl          ← Append-only log
    │   ├── patterns-PH10.json              ← Patterns từng category
    │   ├── patterns-PC06.json
    │   ├── patterns-PV01.json
    │   ├── patterns-DT.json
    │   ├── patterns-NQ57.json
    │   └── patterns-ND85.json
    ├── by-date/
    │   ├── 2026-06/
    │   │   ├── 2026-06-16-PH10-bao-cao-tai-san.md
    │   │   └── 2026-06-15-PV01-ke-hoach-...md
    │   └── 2026-07/
    │       └── ...
    └── config/
        └── workCategories.json             ← User customizations
```

### Analysis Note Template
```markdown
# [Job Title]

**Category:** PH10: Quản lý Tài sản  
**Deadline:** 2026-06-30  
**Estimated Effort:** 4 hours  
**Status:** Created at 2026-06-16 10:30 AM  
**Source:** Document analysis from [source image]  

## Metadata
- Analysis ID: uuid-20260616-001
- Google Task ID: task-abc123
- Estimated vs Pattern: 5 days (pattern avg: 5.2 days) ✓ Match

## Action Plan
- [ ] Kiểm tra hệ thống tài sản hiện có (1h)
- [ ] Thu thập thông tin từ các đơn vị (1h)
- [ ] Xây dựng bản báo cáo (1.5h)
- [ ] Review với PH10 (0.5h)
- [ ] Nộp lên cấp trên

## Insights
- This type of work usually takes 5.2 days
- Your estimate: 5 days (matches!)
- High confidence: 92% estimate accuracy for this category

## Feedback (Auto-updated)
- Status: Pending
- Actual Deadline: -
- Actual Effort: -
```

---

## 5. WORKFLOW & UX

### 5.1 Main Workflow

1. **Input:** User chụp/scan công văn → Paste ảnh vào Obsidian CalendarView chat
2. **Command:** Trigger `📋 Phân tích tài liệu công việc (AI)` command
3. **Processing:** DocumentAnalyzer → Gemini Vision → Classification
4. **Review:** SafetyLayer.confirmAnalysis() modal hiển thị analysis + patterns
5. **Confirm:** User clicks [✅ Add] → lưu vào Tasks/Calendar/Vault
6. **Learning:** Plugin theo dõi actual vs estimated → cải thiện lần sau

### 5.2 Commands (Thêm vào Plugin)

| Command ID | Tên hiển thị | Hành động |
|---------|-----------|---------|
| `analyze-document-image` | `📋 Phân tích tài liệu công việc (AI)` | Paste image → analyze |
| `show-work-insights` | `📊 Xem thống kê phân tích công việc` | Hiển thị insights dashboard |
| `update-task-feedback` | `📝 Cập nhật feedback cho công việc` | Log actual vs estimated |
| `view-analysis-history` | `📚 Xem lịch sử phân tích` | Browse past analyses |
| `recalculate-patterns` | `🔄 Tính lại patterns` | Force re-compute từ history |

### 5.3 Insights Dashboard

```
═════════════════════════════════════════════════════════════
        📊 YOUR WORK ANALYSIS INSIGHTS (127 items analyzed)
═════════════════════════════════════════════════════════════

CATEGORY STATISTICS:
┌─ PH10: Quản lý Tài sản
│  ✓ 34 analyses | Avg 5.2 days | Effort: 4.2h
│  Estimate Accuracy: 92% ✓✓✓✓✓
│
├─ PC06: Cấp phép Vũ khí
│  ✓ 28 analyses | Avg 11.5 days | Effort: 6.1h
│  Estimate Accuracy: 85% ✓✓✓✓
│
└─ PV01: Văn thư & Tham mưu
   ✓ 45 analyses | Avg 3.1 days | Effort: 3.2h
   Estimate Accuracy: 94% ✓✓✓✓✓

RECENT INSIGHTS & RECOMMENDATIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Báo cáo tài sản quý này:
   Your estimate: 5 days
   Pattern average: 5.2 days
   ✓ VERY ACCURATE - Similar tasks took 5-5.5 days

⚠️  Công việc chuyển đổi số:
   Your estimate: 15 days
   Pattern average: 16.3 days
   💡 Tip: Add +1-2 days buffer based on history

PRODUCTIVITY STATS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Average completion rate: 89% on-time (7% early, 4% late)
Most common bottleneck: "Review with approvers" (add 20% buffer)
═════════════════════════════════════════════════════════════
```

---

## 6. DEPENDENCIES & TECHNOLOGY

### Không cần thêm runtime dependency nào
- ✅ Gemini API — đã dùng, hỗ trợ multimodal (inlineData)
- ✅ Google Tasks API — `GoogleTasksAPI.ts` đã có đầy đủ
- ✅ Google Calendar API — `GoogleCalendarAPI.ts` đã có đầy đủ
- ✅ Obsidian APIs — native, `requestUrl` từ obsidian
- ✅ `OAuthManager.ts` — đã handle token refresh

### Build & Development
- TypeScript 5.0+
- esbuild (cấu hình tại `esbuild.config.mjs`)
- Target: ES2020

---

## 7. SUCCESS CRITERIA

| Criterion | Target | Status |
|-----------|--------|--------|
| OCR accuracy trên ảnh scan | >85% | TBD |
| Category classification accuracy | >90% | TBD |
| Deadline estimate within ±1 day | >85% | TBD |
| Estimate improves after 10 samples | +5% accuracy | TBD |
| Build thành công (npm run build) | ✓ | TBD |
| Performance (analyze doc in) | <5 seconds | TBD |
| Insight dashboard load time | <2 seconds | TBD |

---

## 8. FUTURE ENHANCEMENTS (Out of Scope)

- [ ] Email integration (auto-detect work assignments)
- [ ] Advanced analytics (predict workload next quarter)
- [ ] Team sharing (share patterns across team members)
- [ ] Voice input (dictate task details)
- [ ] PDF parsing (không chỉ ảnh)

---

## 9. ROLLBACK PLAN

Nếu có vấn đề:
1. Tất cả data trong `_document-analysis/` là append-only → có thể rollback
2. Google Tasks/Calendar không bị ảnh hưởng
3. Có thể disable feature qua settings toggle
4. Branch `feature/document-analyzer-learning` tách từ `dev` → có thể bỏ mà không ảnh hưởng production

---

## 10. REFERENCES

- **Codebase:** `d:\smartcalendar\`
- **Main Plugin Files:**
  - [`src/main.ts`](../src/main.ts) — Entry point
  - [`src/GeminiAgent.ts`](../src/GeminiAgent.ts) — AI engine (multi-model fallback)
  - [`src/CalendarTools.ts`](../src/CalendarTools.ts) — Tool registry (executor pattern)
  - [`src/SafetyLayer.ts`](../src/SafetyLayer.ts) — Confirmation UI + undo buffer
  - [`src/GoogleTasksAPI.ts`](../src/GoogleTasksAPI.ts) — Google Tasks wrapper
  - [`src/SyncManager.ts`](../src/SyncManager.ts) — Bidirectional sync
- **Existing Patterns:**
  - `VaultContext.ts` — Pattern đọc vault files
  - `OAuthManager.ts` — Pattern auth Google API

---

**Document Version:** 2.0 (updated to match actual codebase)  
**Last Updated:** 2026-06-16  
**Next Review:** After Phase 1 completion
