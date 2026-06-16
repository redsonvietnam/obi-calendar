# 🚀 TASK BREAKDOWN - Parallelizable Work Streams

**Branch:** `feature/document-analyzer-learning` (tách từ `dev`)  
**Working dir:** `d:\smartcalendar\`  
**Strategy:** 7 work streams độc lập → có thể làm song song với nhiều AI sessions  
**Dependency Graph:** Xem bên dưới  

---

## WORK STREAM OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│ STREAM A: Core Data Models & Types (FOUNDATION)             │
│ ├─ A1: Extend types.ts (interfaces + enum cho tính năng mới)│
│ └─ [BLOCKER: Phải hoàn thành trước B, C, D, E, F, G]        │
└─────────────────────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ STREAM B: AI Engine Enhancements             │ STREAM C: Data Storage & History  │
│ ├─ B1: Extend GeminiAgent (thêm imageBase64) │ ├─ C1: Create AnalysisHistory.ts   │
│ └─ B2: Thêm 3 tools vào CalendarTools        │ ├─ C2: Pattern JSON storage        │
│ [Có thể bắt đầu sau A]                       │ └─ [Có thể bắt đầu sau A]          │
└──────────────────────────────────────────────────────────────────────────────┘
         ↓                                              ↓
         │                                              │
┌────────────────────────────────────────┐  ┌────────────────────────────────────┐
│ STREAM D: Document Analyzer Core       │  │ STREAM E: Config & Prompts         │
│ ├─ D1: DocumentAnalyzer.ts (main logic)│  │ ├─ E1: WorkCategoryConfig.ts       │
│ ├─ D2: Image parsing & OCR             │  │ ├─ E2: System prompts (VI) mỗi cat │
│ └─ [Cần A, B xong trước]              │  │ └─ [Độc lập, bắt đầu ngay sau A]   │
└────────────────────────────────────────┘  └────────────────────────────────────┘
         ↓                                              ↓
         └──────────────┬──────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────────┐
│ STREAM F: User Interface (SafetyLayer + InsightsDashboard)     │
│ ├─ F1: confirmAnalysis() method trong SafetyLayer.ts           │
│ ├─ F2: InsightsDashboard (Obsidian ItemView mới)               │
│ └─ [Cần D xong trước]                                          │
└────────────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────────────┐
│ STREAM G: Settings & Main Plugin Integration                   │
│ ├─ G1: Extend SettingsTab.ts (thêm Work Categories section)    │
│ ├─ G2: Wire up all components trong main.ts                    │
│ └─ [Cần F xong trước]                                          │
└────────────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────────────┐
│ STREAM H: Testing & Integration                                │
│ ├─ H1: Manual QA checklist                                     │
│ ├─ H2: Edge case testing                                       │
│ └─ [Cần G xong trước]                                          │
└────────────────────────────────────────────────────────────────┘
```

---

## DETAILED TASK BREAKDOWN

### ✅ STREAM A: Core Data Models & Types

**Dependency:** Không có (FOUNDATION)  
**Priority:** P0 - PHẢI LÀM TRƯỚC  
**Estimated Time:** 1-2 giờ  

#### Task A1: Extend `src/types.ts` với new interfaces

**File:** `d:\smartcalendar\src\types.ts`  
**Current state:** Đã có `CalendarAgentSettings`, `ChatMessage`, `GeminiPart`, `GoogleCalendarEvent`, `GoogleTask`, `GoogleTaskList`  

**Changes cần làm:**
- Thêm `inlineData` vào `GeminiPart` interface (cần cho multimodal)
- Thêm `WorkCategory` enum (6 values + UNKNOWN)
- Thêm `DocumentAnalysisResult` interface
- Thêm `DocumentAnalysis` interface (lưu trong history)
- Thêm `PatternInsights` interface
- Thêm `WorkCategoryConfig` interface

```typescript
// Thêm vào GeminiPart (đã có):
export interface GeminiPart {
  text?: string;
  functionCall?: { ... };
  functionResponse?: { ... };
  inlineData?: {                          // NEW — cho multimodal/vision
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    data: string;                         // base64 string (không có data: prefix)
  };
}

// Thêm mới:
export enum WorkCategory {
  PH10_ASSET_MANAGEMENT = "PH10_ASSET_MANAGEMENT",
  PC06_WEAPON_LICENSE = "PC06_WEAPON_LICENSE",
  PV01_ADMIN_DOCS = "PV01_ADMIN_DOCS",
  DT_DIGITAL_TRANSFORM = "DT_DIGITAL_TRANSFORM",
  NQ57_IT_DEVELOPMENT = "NQ57_IT_DEVELOPMENT",
  ND85_INFO_SECURITY = "ND85_INFO_SECURITY",
  UNKNOWN = "UNKNOWN"
}

export interface WorkCategoryConfig {
  displayName: string;
  keywords: string[];
  defaultDeadlineDays: number;
  estimatedEffortHours: number;
  actionPlanTemplate: string[];
  systemPrompt: string;
}

export interface DocumentAnalysisResult {
  jobTitle: string;
  description: string;
  category: WorkCategory;
  detectedKeywords: string[];
  deadline: string;                         // ISO date "YYYY-MM-DD"
  estimatedDeadlineDays: number;
  estimatedHours: number;
  actionPlan: Array<{ title: string; estimatedHours: number; completed: boolean }>;
  actionPlanEstimates: Record<string, number>;
  requiredApprovals: string[];
  riskLevel: "low" | "medium" | "high";
  patternInsights?: {
    similarTasksCount: number;
    averageDeadlineDays: number;
    estimateAccuracy: number;
    confidenceLevel: "high" | "medium" | "low";
  };
}

export interface DocumentAnalysis {
  id: string;
  timestamp: string;                        // ISO string
  category: WorkCategory;
  jobTitle: string;
  description?: string;
  detectedKeywords: string[];
  estimatedDeadlineDays: number;
  estimatedHours: number;
  estimatedRiskLevel: "low" | "medium" | "high";
  actualDeadlineDays?: number;
  actualHours?: number;
  actionPlan: string[];
  actionPlanEstimates?: Record<string, number>;
  requiredApprovals?: string[];
  userFeedback?: "accurate" | "too_short" | "too_long";
  feedbackComment?: string;
  googleTaskId?: string;
  googleEventId?: string;
  vaultNoteId?: string;
}

export interface PatternInsights {
  category: WorkCategory;
  totalAnalyzed: number;
  avgDeadlineDays: number;
  stdDevDays: number;
  avgHours: number;
  stdDevHours: number;
  estimateAccuracy: number;
  earlyCompletionRate: number;
  lateCompletionRate: number;
  commonKeywords: string[];
  frequentApprovers: string[];
  riskDistribution: { low: number; medium: number; high: number };
  lastUpdated: string;                      // ISO string
  dataQuality: "high" | "medium" | "low";
}
```

**Acceptance Criteria:**
- [ ] TypeScript compile không lỗi: `npm run build`
- [ ] Tất cả interfaces export đúng
- [ ] `GeminiPart.inlineData` có type đúng
- [ ] `WorkCategory` enum có đủ 7 values (6 + UNKNOWN)

---

### 🔵 STREAM B: AI Engine Enhancements

**Dependency:** Stream A completed  
**Priority:** P0 — Critical  
**Estimated Time:** 3-4 giờ  

#### Task B1: Extend `src/GeminiAgent.ts` — Multimodal Input

**File:** `d:\smartcalendar\src\GeminiAgent.ts`  
**Current signature (thực tế):**
```typescript
async run(
  userMessage: string,
  history: GeminiContent[],
  timezone: string,
  vaultSnapshot: string,
  signal?: AbortSignal,
  excludedTools?: string[]
): Promise<AgentRunResult & { updatedHistory: GeminiContent[] }>
```

**Changes cần làm:**
- Thêm optional `imageBase64?: string` param (CUỐI danh sách params để backward compatible)
- Trong body của `run()`, build user parts array có thể kèm image:

```typescript
// Tìm dòng này trong run():
const contents: GeminiContent[] = [
  systemTurn,
  ...history,
  {
    role: "user",
    parts: [{ text: userMessage }]    // ← SỬA PHẦN NÀY
  }
];

// Sửa thành:
const userParts: GeminiPart[] = [{ text: userMessage }];
if (imageBase64) {
  userParts.push({
    inlineData: {
      mimeType: "image/jpeg",
      data: imageBase64.replace(/^data:image\/\w+;base64,/, "")
    }
  });
}

const contents: GeminiContent[] = [
  systemTurn,
  ...history,
  { role: "user", parts: userParts }
];
```

**Acceptance Criteria:**
- [ ] `run()` vẫn hoạt động như cũ khi không truyền imageBase64
- [ ] Khi truyền imageBase64, Gemini nhận được cả text + image trong parts[]
- [ ] Strip data URL prefix nếu có
- [ ] Build thành công không lỗi

#### Task B2: Thêm 3 Tools vào `src/CalendarTools.ts`

**File:** `d:\smartcalendar\src\CalendarTools.ts`  
**Current state:** Đã có 14 executors trong `this.executors = { ... }` của constructor.

**Pattern đang có (FOLLOW EXACT PATTERN):**
```typescript
// Constructor hiện tại:
this.executors = {
  list_events: this.execListEvents.bind(this),
  create_event: this.execCreateEvent.bind(this),
  // ... 12 more executors
};
```

**Changes cần làm — thêm vào executor registry:**
```typescript
// Trong this.executors:
analyze_document_image: this.execAnalyzeDocumentImage.bind(this),
create_task_from_analysis: this.execCreateTaskFromAnalysis.bind(this),
create_event_from_analysis: this.execCreateEventFromAnalysis.bind(this),
```

**Thêm tool declarations vào `getGeminiToolDeclarations()`:**
```typescript
// Tạo private method getDocumentAnalysisToolDeclarations():
private getDocumentAnalysisToolDeclarations(): ToolDefinition[] {
  return [
    {
      name: "analyze_document_image",
      description: "Phân tích tài liệu công việc từ ảnh scan — OCR + phân loại category + ước lượng",
      parameters: {
        type: "object",
        properties: {
          imageBase64: { type: "string", description: "Base64 encoded image" },
          userContext: { type: "string", description: "Ngữ cảnh bổ sung từ user" }
        },
        required: ["imageBase64"]
      }
    },
    {
      name: "create_task_from_analysis",
      description: "Tạo Google Task từ kết quả phân tích DocumentAnalyzer",
      parameters: {
        type: "object",
        properties: {
          jobTitle: { type: "string" },
          deadline: { type: "string" },
          estimatedHours: { type: "number" },
          category: { type: "string" },
          notes: { type: "string" }
        },
        required: ["jobTitle", "deadline"]
      }
    },
    {
      name: "create_event_from_analysis",
      description: "Tạo Google Calendar event từ kết quả phân tích DocumentAnalyzer",
      parameters: {
        type: "object",
        properties: {
          jobTitle: { type: "string" },
          startDate: { type: "string", description: "RFC3339" },
          endDate: { type: "string", description: "RFC3339" },
          estimatedDays: { type: "number" }
        },
        required: ["jobTitle", "startDate", "endDate"]
      }
    }
  ];
}
```

**Implement 3 exec methods:**
```typescript
private async execAnalyzeDocumentImage(args: Record<string, unknown>): Promise<unknown> {
  // Sẽ được gọi bởi GeminiAgent khi user request analyze document
  // Delegate sang DocumentAnalyzer (inject vào CalendarTools qua deps)
  const imageBase64 = this.asRequiredString(args.imageBase64, "imageBase64");
  const userContext = this.asOptionalString(args.userContext);
  
  if (!this.documentAnalyzer) {
    throw new Error("DocumentAnalyzer chưa được khởi tạo.");
  }
  return await this.documentAnalyzer.analyzeDocument(imageBase64, userContext);
}

private async execCreateTaskFromAnalysis(args: Record<string, unknown>): Promise<unknown> {
  const title = this.asRequiredString(args.jobTitle, "jobTitle");
  const due = this.asRequiredString(args.deadline, "deadline");
  const notes = this.asOptionalString(args.notes);
  
  const task: Partial<GoogleTask> = { title, due, notes };
  return await this.googleTasksApi.createTask("@default", task);
}

private async execCreateEventFromAnalysis(args: Record<string, unknown>): Promise<unknown> {
  const summary = this.asRequiredString(args.jobTitle, "jobTitle");
  const startDateTime = this.asRequiredString(args.startDate, "startDate");
  const endDateTime = this.asRequiredString(args.endDate, "endDate");
  
  const event: GoogleCalendarEvent = {
    summary,
    start: { dateTime: startDateTime, timeZone: this.getTimezone() },
    end: { dateTime: endDateTime, timeZone: this.getTimezone() }
  };
  return await this.calendarApi.createEvent("primary", event);
}
```

**Lưu ý:** Phải thêm `documentAnalyzer?: DocumentAnalyzer` vào `CalendarToolsDependencies` và `CalendarTools` class.

**Acceptance Criteria:**
- [ ] 3 executors được đăng ký trong registry
- [ ] Tool declarations có trong `getGeminiToolDeclarations()`
- [ ] Exec methods gọi đúng APIs
- [ ] Error handling như các executors khác

---

### 🟣 STREAM C: Data Storage & History Management

**Dependency:** Stream A completed  
**Priority:** P0 — Core feature  
**Estimated Time:** 4-5 giờ  

#### Task C1: Tạo `src/AnalysisHistory.ts` — JSONL Storage

**File:** `d:\smartcalendar\src\AnalysisHistory.ts` (NEW)  
**Size:** ~200-250 lines  

**Pattern đang dùng (FOLLOW):** `VaultContext.ts` và `SyncManager.ts` cho cách đọc/ghi vault files.

**Constructor:**
```typescript
import { normalizePath, TFile } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { DocumentAnalysis, PatternInsights, WorkCategory } from "./types";

export class AnalysisHistory {
  private readonly BASE_FOLDER = "_document-analysis";
  private readonly HISTORY_FILE = "_document-analysis/metadata/analysis-history.jsonl";
  
  constructor(private readonly plugin: ObsidianCalendarAgentPlugin) {}
  
  async initialize(): Promise<void> {
    // Tạo các folders cần thiết
    await this.ensureFolder(this.BASE_FOLDER);
    await this.ensureFolder(`${this.BASE_FOLDER}/metadata`);
    await this.ensureFolder(`${this.BASE_FOLDER}/by-date`);
    await this.ensureFolder(`${this.BASE_FOLDER}/config`);
  }
  
  async logAnalysis(analysis: DocumentAnalysis): Promise<string>;
  async getHistoryByCategory(category: WorkCategory, limit?: number): Promise<DocumentAnalysis[]>;
  async getPatternsForCategory(category: WorkCategory): Promise<PatternInsights>;
  async recordFeedback(analysisId: string, actual: { deadlineDays: number; hours: number; feedback: string }): Promise<void>;
  async getAllAnalyses(): Promise<DocumentAnalysis[]>;
}
```

**Storage Format JSONL:** (xem ARCHITECTURE.md section 5.2)

**Key Implementation Notes:**
- Dùng `this.plugin.app.vault.read()` và `this.plugin.app.vault.modify()` (pattern từ SyncManager)
- UUID: `crypto.randomUUID()` (available in modern browsers/Electron)
- `normalizePath()` từ Obsidian API cho tất cả paths

#### Task C2: Pattern JSON Storage

**Files:** `_document-analysis/metadata/patterns-[category].json`  

**Pattern file format:**
```json
{
  "category": "PH10_ASSET_MANAGEMENT",
  "lastUpdated": "2026-06-16T12:00:00Z",
  "totalAnalyzed": 12,
  "avgDeadlineDays": 5.2,
  "stdDevDays": 0.8,
  "avgHours": 4.5,
  "stdDevHours": 0.7,
  "estimateAccuracy": 92,
  "commonKeywords": ["báo cáo", "tài sản", "quý", "kiểm kê"],
  "frequentApprovers": ["PH10_Manager"],
  "riskDistribution": { "low": 85, "medium": 12, "high": 3 }
}
```

**Acceptance Criteria:**
- [ ] JSONL file được tạo và append đúng
- [ ] Pattern calculation chính xác (mean, std dev)
- [ ] `getPatternsForCategory()` trả đúng stats
- [ ] Vault folders được tạo tự động
- [ ] Handle file không tồn tại gracefully (return defaults)

---

### 🟠 STREAM D: Document Analyzer Core

**Dependency:** Stream A, B completed  
**Priority:** P0 — Main feature  
**Estimated Time:** 5-6 giờ  

#### Task D1: Tạo `src/DocumentAnalyzer.ts`

**File:** `d:\smartcalendar\src\DocumentAnalyzer.ts` (NEW)  
**Size:** ~250-280 lines  

**Constructor pattern (follow CalendarTools):**
```typescript
import { Notice, normalizePath } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { GeminiAgent } from "./GeminiAgent";
import { AnalysisHistory } from "./AnalysisHistory";
import { VaultContext } from "./VaultContext";
import { WorkCategoryConfig } from "./WorkCategoryConfig";
import { DocumentAnalysisResult, DocumentAnalysis, WorkCategory, PatternInsights } from "./types";

export interface DocumentAnalyzerDeps {
  plugin: ObsidianCalendarAgentPlugin;
  geminiAgent: GeminiAgent;
  analysisHistory: AnalysisHistory;
  vaultContext: VaultContext;
  workCategoryConfig: WorkCategoryConfig;
}

export class DocumentAnalyzer {
  constructor(private readonly deps: DocumentAnalyzerDeps) {}
  
  async analyzeDocument(imageBase64: string, userContext?: string): Promise<DocumentAnalysisResult>;
  private parseImageBase64(imageData: string): string;
  private async extractTextViaGemini(imageBase64: string): Promise<string>;
  private classifyWorkCategory(text: string): WorkCategory;  // keyword matching, no AI needed
  private buildEnrichedPrompt(category: WorkCategory, patterns: PatternInsights, extractedText: string): string;
  private async saveAnalysisToVault(analysis: DocumentAnalysis): Promise<string>;
}
```

**Implementation Steps trong `analyzeDocument()`:**
1. `parseImageBase64()` — validate + strip data URL prefix
2. `extractTextViaGemini()` — gọi `deps.geminiAgent.run()` với imageBase64
3. `classifyWorkCategory()` — keyword matching với WorkCategoryConfig
4. `deps.analysisHistory.getPatternsForCategory()` — lấy patterns từ history
5. `buildEnrichedPrompt()` — inject patterns vào prompt
6. `deps.geminiAgent.run()` với enriched prompt — nhận full analysis JSON
7. Parse JSON response từ Gemini assistantText
8. `deps.analysisHistory.logAnalysis()` — save to JSONL
9. `saveAnalysisToVault()` — tạo note theo template (dùng `plugin.app.vault.create()`)
10. Return `DocumentAnalysisResult`

**Acceptance Criteria:**
- [ ] `analyzeDocument()` trả `DocumentAnalysisResult` hợp lệ
- [ ] Category classification đúng với keywords
- [ ] Pattern context có trong Gemini prompt
- [ ] Analysis được save vào JSONL
- [ ] Vault note được tạo
- [ ] Lỗi được handle với try/catch và `new Notice()`

---

### 🟡 STREAM E: Configuration & Work Category Definitions

**Dependency:** Stream A completed  
**Priority:** P1  
**Estimated Time:** 3-4 giờ  

#### Task E1: Tạo `src/WorkCategoryConfig.ts`

**File:** `d:\smartcalendar\src\WorkCategoryConfig.ts` (NEW)  
**Size:** ~150 lines  

```typescript
import { WorkCategory, WorkCategoryConfig as WorkCategoryConfigInterface } from "./types";

export class WorkCategoryConfig {
  private readonly categories: Record<WorkCategory, WorkCategoryConfigInterface>;
  
  constructor() {
    this.categories = {
      [WorkCategory.PH10_ASSET_MANAGEMENT]: {
        displayName: "PH10: Quản lý Tài sản",
        keywords: ["tài sản", "vũ khí", "quân trang", "cấp phát", "kiểm kê", "báo cáo tài sản"],
        defaultDeadlineDays: 5,
        estimatedEffortHours: 4,
        actionPlanTemplate: [
          "Kiểm tra hệ thống tài sản hiện có",
          "Thu thập thông tin từ các đơn vị",
          "Xây dựng bản báo cáo",
          "Review với PH10",
          "Nộp lên cấp trên"
        ],
        systemPrompt: `Bạn là chuyên gia phân tích công việc quản lý tài sản (PH10).
Tính chất: Báo cáo, kiểm kê, cấp phát tài sản cho các đơn vị.
Thời gian tiêu biểu: 5-7 ngày làm việc.
Yêu cầu: Xác thực số liệu, kiểm tra từng mục, cross-check với hệ thống.
Cảnh báo: Thường có follow-up từ 2-3 bộ phận. Yêu cầu phê duyệt PH10_Manager.`
      },
      
      [WorkCategory.PC06_WEAPON_LICENSE]: {
        displayName: "PC06: Cấp phép Vũ khí",
        keywords: ["cấp phép", "đăng kí", "giấy phép", "hồ sơ", "vũ khí", "đạn dược"],
        defaultDeadlineDays: 10,
        estimatedEffortHours: 6,
        actionPlanTemplate: [
          "Tiếp nhận và kiểm tra hồ sơ",
          "Xác minh thông tin đăng ký",
          "Trình duyệt lên PC06",
          "Chỉnh sửa theo phản hồi",
          "Cấp phép và lưu hồ sơ"
        ],
        systemPrompt: `Bạn là chuyên gia về thủ tục cấp phép vũ khí (PC06).
Tính chất: Hành chính pháp lý, cần chính xác tuyệt đối.
Thời gian tiêu biểu: 10-14 ngày (có thể kéo dài nếu hồ sơ thiếu).
Cảnh báo: Deadline pháp lý nghiêm ngặt. Hồ sơ không đầy đủ gây trễ toàn bộ process.`
      },
      
      [WorkCategory.PV01_ADMIN_DOCS]: {
        displayName: "PV01: Văn thư & Tham mưu",
        keywords: ["văn thư", "công văn", "tham mưu", "viễn thông", "cơ yếu", "thông báo", "chỉ thị"],
        defaultDeadlineDays: 3,
        estimatedEffortHours: 3,
        actionPlanTemplate: [
          "Soạn thảo văn bản",
          "Trình duyệt lãnh đạo",
          "Chỉnh sửa theo ý kiến",
          "Ký và đóng dấu",
          "Phát hành"
        ],
        systemPrompt: `Bạn là chuyên gia văn thư, tham mưu hành chính (PV01).
Tính chất: Văn bản hành chính, công văn, thông báo nội bộ.
Thời gian tiêu biểu: 2-4 ngày.
Yêu cầu: Văn phong chính xác, đúng form mẫu, trình bày chuẩn.`
      },
      
      [WorkCategory.DT_DIGITAL_TRANSFORM]: {
        displayName: "DT: Chuyển đổi Số",
        keywords: ["chuyển đổi số", "số hóa", "hệ thống", "ứng dụng", "triển khai", "phần mềm", "công nghệ"],
        defaultDeadlineDays: 15,
        estimatedEffortHours: 16,
        actionPlanTemplate: [
          "Nghiên cứu và đánh giá hiện trạng",
          "Lập kế hoạch chi tiết",
          "Trình duyệt ngân sách",
          "Triển khai thí điểm",
          "Đánh giá và điều chỉnh",
          "Triển khai toàn diện",
          "Báo cáo kết quả"
        ],
        systemPrompt: `Bạn là chuyên gia chuyển đổi số (DT).
Tính chất: Dự án IT, số hóa quy trình, triển khai phần mềm.
Thời gian tiêu biểu: 15-25 ngày.
Cảnh báo: Thường bị trễ do phê duyệt ngân sách và phối hợp nhiều đơn vị.`
      },
      
      [WorkCategory.NQ57_IT_DEVELOPMENT]: {
        displayName: "NQ57: Nghị Quyết 57",
        keywords: ["NQ 57", "nghị quyết 57", "phát triển CNTT", "hạ tầng", "dự toán", "kế hoạch CNTT"],
        defaultDeadlineDays: 20,
        estimatedEffortHours: 20,
        actionPlanTemplate: [
          "Thu thập yêu cầu từ các đơn vị",
          "Lập dự toán ngân sách",
          "Xây dựng kế hoạch chi tiết",
          "Trình duyệt nhiều cấp",
          "Điều chỉnh theo phản hồi",
          "Phê duyệt cuối cùng"
        ],
        systemPrompt: `Bạn là chuyên gia kế hoạch phát triển CNTT theo NQ57.
Tính chất: Kế hoạch dài hạn, liên quan nhiều đơn vị và cấp phê duyệt.
Thời gian tiêu biểu: 20-30 ngày.
Cảnh báo: Quy trình phê duyệt nhiều bước. Cần buffer thêm 20-30%.`
      },
      
      [WorkCategory.ND85_INFO_SECURITY]: {
        displayName: "ND85: Nghị định 85",
        keywords: ["ND 85", "nghị định 85", "an toàn thông tin", "cấp độ an toàn", "bảo mật", "ATTT"],
        defaultDeadlineDays: 30,
        estimatedEffortHours: 24,
        actionPlanTemplate: [
          "Đánh giá hiện trạng an toàn thông tin",
          "Xác định cấp độ an toàn",
          "Lập phương án bảo mật",
          "Triển khai giải pháp",
          "Kiểm tra và đánh giá",
          "Lập báo cáo compliance"
        ],
        systemPrompt: `Bạn là chuyên gia an toàn thông tin theo ND85.
Tính chất: Compliance, audit, bảo mật hệ thống.
Thời gian tiêu biểu: 30-45 ngày.
Cảnh báo: Yêu cầu kỹ thuật cao, phải tuân thủ đúng chuẩn mực pháp lý.`
      },
      
      [WorkCategory.UNKNOWN]: {
        displayName: "Chưa phân loại",
        keywords: [],
        defaultDeadlineDays: 7,
        estimatedEffortHours: 5,
        actionPlanTemplate: ["Xem xét yêu cầu", "Lập kế hoạch", "Thực hiện", "Báo cáo"],
        systemPrompt: "Bạn là chuyên gia phân tích công việc hành chính."
      }
    };
  }
  
  getConfig(category: WorkCategory): WorkCategoryConfigInterface {
    return this.categories[category] ?? this.categories[WorkCategory.UNKNOWN];
  }
  
  classifyByKeywords(text: string): WorkCategory {
    const lowerText = text.toLowerCase();
    
    // Tính điểm match cho mỗi category
    const scores: Record<WorkCategory, number> = {} as Record<WorkCategory, number>;
    
    for (const [category, config] of Object.entries(this.categories)) {
      if (category === WorkCategory.UNKNOWN) continue;
      
      scores[category as WorkCategory] = config.keywords.filter(
        kw => lowerText.includes(kw.toLowerCase())
      ).length;
    }
    
    // Tìm category có điểm cao nhất
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    
    if (best && best[1] > 0) {
      return best[0] as WorkCategory;
    }
    return WorkCategory.UNKNOWN;
  }
  
  getAllCategories(): WorkCategory[] {
    return Object.values(WorkCategory).filter(c => c !== WorkCategory.UNKNOWN);
  }
}
```

**Acceptance Criteria:**
- [ ] Cả 6 category được định nghĩa đầy đủ
- [ ] Keywords phù hợp và comprehensive
- [ ] Deadlines match với FEATURE_SPEC table
- [ ] Action plan templates chi tiết
- [ ] System prompts bằng tiếng Việt
- [ ] `classifyByKeywords()` hoạt động đúng với sample text

---

### 🟢 STREAM F: User Interface

**Dependency:** Stream D completed  
**Priority:** P1  
**Estimated Time:** 5-6 giờ  

#### Task F1: Extend `src/SafetyLayer.ts` — Review Modal

**File:** `d:\smartcalendar\src\SafetyLayer.ts`  
**Current state:** Đã có `SafetyConfirmModal` class.  

**Changes cần làm:**
```typescript
// 1. Thêm "analyze_document" vào SafetyActionType
export type SafetyActionType = 
  | "create_event" 
  | "update_event" 
  | "delete_event" 
  | "write_note"
  | "analyze_document";  // NEW

// 2. Thêm method confirmAnalysis() vào SafetyLayer class
async confirmAnalysis(
  analysis: DocumentAnalysisResult,
  patterns: PatternInsights
): Promise<{ confirmed: boolean }> {
  return new Promise((resolve) => {
    const modal = new DocumentAnalysisConfirmModal(
      this.plugin, analysis, patterns, resolve
    );
    modal.open();
  });
}
```

**3. Tạo DocumentAnalysisConfirmModal class (thêm vào cuối file SafetyLayer.ts):**
```typescript
class DocumentAnalysisConfirmModal extends Modal {
  // UI layout xem ARCHITECTURE.md section 8.2
  // Nút: [✅ Add to Calendar] [✏️ Edit] [❌ Cancel]
}
```

**Acceptance Criteria:**
- [ ] Modal hiển thị đầy đủ fields
- [ ] Pattern insights formatted rõ ràng
- [ ] 3 buttons hoạt động đúng
- [ ] ESC/click outside = cancel

#### Task F2: Tạo `src/InsightsDashboard.ts` — Sidebar View

**File:** `d:\smartcalendar\src\InsightsDashboard.ts` (NEW)  
**Pattern:** Follow `CalendarView.ts` (đã implement Obsidian ItemView)

```typescript
import { ItemView, WorkspaceLeaf } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { AnalysisHistory } from "./AnalysisHistory";

export const VIEW_TYPE_INSIGHTS_DASHBOARD = "obsidian-calendar-agent-insights";

export class InsightsDashboard extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: ObsidianCalendarAgentPlugin) {
    super(leaf);
  }
  
  getViewType(): string { return VIEW_TYPE_INSIGHTS_DASHBOARD; }
  getDisplayText(): string { return "Work Analysis Insights"; }
  getIcon(): string { return "bar-chart-2"; }
  
  async onOpen(): Promise<void> {
    await this.render();
  }
  
  private async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    
    // Header
    contentEl.createEl("h2", { text: "📊 Work Analysis Insights" });
    
    // Load data từ AnalysisHistory
    const history = await this.plugin.analysisHistory.getAllAnalyses();
    
    // Statistics table per category
    // Recommendations
    // Productivity metrics
    // Xem ARCHITECTURE.md section 8.2 để biết UI layout
  }
}
```

**Acceptance Criteria:**
- [ ] Dashboard load không có errors
- [ ] Metrics tính đúng từ history
- [ ] UI readable và formatted đẹp
- [ ] Command để show/hide dashboard hoạt động

---

### 🔴 STREAM G: Settings & Main Plugin Integration

**Dependency:** Stream F completed  
**Priority:** P1  
**Estimated Time:** 3-4 giờ  

#### Task G1: Extend `src/SettingsTab.ts`

**File:** `d:\smartcalendar\src\SettingsTab.ts`  
**Current state:** Đã có Gemini API, OAuth, Timezone, Sync settings.

**Thêm sau phần Sync settings hiện có:**
```typescript
// Thêm section mới:
containerEl.createEl("h3", { text: "📊 Document Analysis & Learning" });

new Setting(containerEl)
  .setName("Bật Pattern Learning")
  .setDesc("AI học từ lịch sử phân tích để ước lượng tốt hơn")
  .addToggle(toggle => toggle
    .setValue(this.plugin.settings.documentAnalysis?.enablePatternLearning ?? true)
    .onChange(async value => {
      if (!this.plugin.settings.documentAnalysis) {
        this.plugin.settings.documentAnalysis = {};
      }
      this.plugin.settings.documentAnalysis.enablePatternLearning = value;
      await this.plugin.savePluginSettings();
    })
  );

new Setting(containerEl)
  .setName("Hiển thị Pattern Insights trong Review")
  .setDesc("Hiển thị thống kê lịch sử khi xem xét phân tích mới")
  .addToggle(toggle => toggle
    .setValue(this.plugin.settings.documentAnalysis?.showPatternInsights ?? true)
    .onChange(async value => { ... })
  );
```

**Cần thêm vào `CalendarAgentSettings` trong `types.ts`:**
```typescript
documentAnalysis?: {
  enablePatternLearning: boolean;
  showPatternInsights: boolean;
};
```

#### Task G2: Wire Up trong `src/main.ts`

**File:** `d:\smartcalendar\src\main.ts`  
**Current state:** Đã initialize: `oauthManager`, `googleCalendarApi`, `googleTasksApi`, `vaultContext`, `safetyLayer`, `calendarTools`, `geminiAgent`, `syncManager`.

**Thêm vào class properties:**
```typescript
analysisHistory!: AnalysisHistory;
workCategoryConfig!: WorkCategoryConfig;
documentAnalyzer!: DocumentAnalyzer;
insightsDashboard?: InsightsDashboard;
```

**Thêm vào `onload()` sau `this.syncManager = ...`:**
```typescript
// Initialize Document Analysis feature
this.analysisHistory = new AnalysisHistory(this);
await this.analysisHistory.initialize();  // tạo vault folders

this.workCategoryConfig = new WorkCategoryConfig();

this.documentAnalyzer = new DocumentAnalyzer({
  plugin: this,
  geminiAgent: this.geminiAgent,
  analysisHistory: this.analysisHistory,
  vaultContext: this.vaultContext,
  workCategoryConfig: this.workCategoryConfig
});

// Đăng ký InsightsDashboard view
this.registerView(VIEW_TYPE_INSIGHTS_DASHBOARD, leaf => 
  new InsightsDashboard(leaf, this)
);
```

**Thêm commands mới:**
```typescript
this.addCommand({
  id: "analyze-document-image",
  name: "📋 Phân tích tài liệu công việc (AI)",
  callback: () => this.showDocumentAnalyzer()
});

this.addCommand({
  id: "show-work-insights",
  name: "📊 Xem thống kê phân tích công việc",
  callback: async () => this.activateInsightsDashboard()
});

this.addCommand({
  id: "recalculate-patterns",
  name: "🔄 Tính lại Work Patterns",
  callback: async () => {
    new Notice("Đang tính lại patterns...");
    // trigger recalculation
  }
});
```

**Acceptance Criteria:**
- [ ] Plugin load không có errors
- [ ] Tất cả new classes initialized
- [ ] Commands được đăng ký và callable
- [ ] Vault folders được tạo
- [ ] `npm run build` thành công

---

### 🟣 STREAM H: Testing & Integration

**Dependency:** Stream G completed  
**Priority:** P0 — Quality assurance  
**Estimated Time:** 2-4 giờ  

#### Task H1: Build Verification
```bash
cd d:\smartcalendar
npm run build
# → Phải succeed với không có TypeScript errors
```

#### Task H2: Manual QA Checklist

- [ ] Plugin load trong Obsidian không có console errors
- [ ] Command "📋 Phân tích tài liệu" mở được dialog hoặc prompt
- [ ] Paste ảnh → OCR hoạt động (cần Gemini API key valid)
- [ ] Category được phân loại đúng (test với ảnh có text "tài sản")
- [ ] Review modal hiển thị đầy đủ thông tin
- [ ] Click [✅ Add] → tạo Google Task thành công
- [ ] Vault note được tạo trong `_document-analysis/by-date/`
- [ ] JSONL history được append
- [ ] Command "📊 Insights" mở InsightsDashboard
- [ ] Settings mới hiển thị trong Settings tab
- [ ] SyncManager không bị ảnh hưởng

#### Task H3: Edge Case Testing

- [ ] Ảnh không chứa text liên quan → category = UNKNOWN, vẫn handle gracefully
- [ ] Gemini API timeout → Notice lỗi thích hợp, không crash
- [ ] JSONL file corrupt một dòng → skip dòng đó, tiếp tục parse
- [ ] Vault folder không có quyền ghi → Notice lỗi
- [ ] Image quá lớn (>5MB) → Warning message

---

## PARALLELIZATION STRATEGY

### Session Planning (7 sessions song song được)

| Session | Stream | Tasks | Time | Blocker |
|---------|--------|-------|------|---------|
| 1 | A | A1: types.ts | 1-2h | Không có (BẮT ĐẦU TRƯỚC) |
| 2 | E | E1: WorkCategoryConfig | 3-4h | Chỉ cần A |
| 3 | B | B1: GeminiAgent multimodal | 1-2h | A |
| 4 | B | B2: CalendarTools tools | 2-3h | A, B1 |
| 5 | C | C1, C2: AnalysisHistory + patterns | 4-5h | A |
| 6 | D | D1, D2: DocumentAnalyzer | 5-6h | A, B, C, E |
| 7 | F | F1, F2: SafetyLayer + Dashboard | 5-6h | D |
| 8 | G | G1, G2: Settings + main.ts | 3-4h | F, E |
| 9 | H | H1-H3: Testing | 2-4h | G |

### Optimal Execution Order

**Phase 1 (Bắt đầu ngay):**
- Session 1: Stream A (types.ts) — **BLOCKER**

**Phase 2 (Song song, sau Phase 1):**
- Session 2: Stream E (WorkCategoryConfig)
- Session 3: Stream B.1 (GeminiAgent)
- Session 4: Stream C (AnalysisHistory)

**Phase 3 (Song song, sau Phase 2):**
- Session 5: Stream B.2 (CalendarTools tools)
- Session 6: Stream D (DocumentAnalyzer) — cần B.1, C, E

**Phase 4 (Sau Phase 3):**
- Session 7: Stream F (UI)

**Phase 5 (Sequential):**
- Session 8: Stream G (Integration)
- Session 9: Stream H (Testing)

### Critical Path

**Longest path:** A → B → D → F → G → H  
**Estimated total:** ~18-22h (với optimal parallelization: ~8-10h wall clock)

---

## SUCCESS CHECKLIST (Final)

- [ ] All streams completed và tested
- [ ] `npm run build` thành công không có TypeScript errors
- [ ] Plugin load không có console errors
- [ ] Tất cả commands hoạt động
- [ ] OCR hoạt động với ảnh thật
- [ ] Category classification đúng
- [ ] Review modal đầy đủ
- [ ] JSONL history correct format
- [ ] Vault folders tạo tự động
- [ ] InsightsDashboard functional
- [ ] Google Tasks/Calendar integration works
- [ ] SafetyLayer review modal hiển thị
- [ ] manifest.json version bumped: `0.0.1` → `1.0.0`
- [ ] README.md updated
- [ ] Git tag: `v1.0.0`
- [ ] Ready cho production release ✨

---

**Document Version:** 2.0 (updated to match actual codebase)  
**Last Updated:** 2026-06-16  
**Key Changes từ v1.0:**
- Working dir: `d:\smartcalendar` (không phải `d:\obi-calendar`)
- Base branch: `dev` (không phải `main`)
- GeminiAgent.run() signature thực tế (7 params)
- CalendarTools executor pattern thực tế
- SafetyLayer hiện tại (4 action types)
- Version: 0.0.1 → 1.0.0 (không phải 2.0.0)
- Thêm WorkCategoryConfig implementation chi tiết
- Bundle size estimate realistic
