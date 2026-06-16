# 🏗️ ARCHITECTURE - Technical Deep Dive

**Purpose:** Quyết định kỹ thuật, design patterns, implementation guidelines  
**Audience:** Developers (AI agents + human), Code reviewers  
**Format:** Giải thích TẠI SAO, không chỉ CÁI GÌ  

---

## 1. DESIGN PHILOSOPHY

### Core Principles

1. **Minimal Coupling**
   - Mỗi class mới có trách nhiệm đơn lẻ
   - Dependency injection để dễ test
   - Không dùng global state

2. **Leverage Existing Patterns**
   - Tái dụng executor registry pattern của `CalendarTools` (đã có 14 tools)
   - Tái dụng `SafetyLayer.openConfirmModal()` modal framework
   - Tái dụng `VaultContext.buildSnapshot()` pattern đọc vault
   - Tái dụng `GeminiAgent.generateContent()` pattern gọi Gemini REST API
   - Tái dụng `requestUrl` của Obsidian thay vì `fetch` để tránh CORS

3. **Append-Only Data**
   - JSONL cho immutable audit trail
   - Không bao giờ xóa history (chỉ archive)
   - Cho phép rollback + forensics

4. **Self-Improving System**
   - Pattern extraction từ dữ liệu lịch sử
   - Feedback loop: actual vs estimated
   - AI prompts được enrich bằng patterns học được
   - Cải thiện liên tục mà không cần retrain

---

## 2. CLASS HIERARCHY & RELATIONSHIPS

### Overview

```
Plugin (main.ts)
├── GeminiAgent (EXTEND — thêm imageBase64 param)
│   ├── MODEL_CANDIDATES: 8 models với auto-fallback
│   ├── API: https://generativelanguage.googleapis.com/v1beta
│   └── Dùng requestUrl của Obsidian (không phải fetch thuần)
│
├── DocumentAnalyzer (NEW)
│   ├── depends: GeminiAgent, AnalysisHistory, VaultContext
│   └── main entry point cho document analysis
│
├── AnalysisHistory (NEW)
│   ├── manages: JSONL log, pattern calculation
│   ├── depends: Obsidian vault API (qua plugin reference)
│   └── used by: DocumentAnalyzer, InsightsDashboard
│
├── WorkCategoryConfig (NEW)
│   ├── contains: 6 category definitions + system prompts
│   └── used by: DocumentAnalyzer
│
├── CalendarTools (EXTEND)
│   ├── Đã có 14 executors (list_events, create_event, list_tasks, ...)
│   └── Thêm 3 executors: analyze_document_image, create_task_from_analysis, create_event_from_analysis
│
├── SafetyLayer (EXTEND)
│   ├── SafetyActionType hiện có: "create_event"|"update_event"|"delete_event"|"write_note"
│   ├── Thêm: "analyze_document" vào union type
│   └── Thêm method confirmAnalysis()
│
├── InsightsDashboard (NEW — Obsidian ItemView)
│   └── sidebar view hiển thị stats + recommendations
│
├── SyncManager (LEVERAGE — không sửa)
│   └── syncCompletionFromGoogleTasks() gọi bởi AnalysisHistory.recordFeedback()
│
└── SettingsTab (EXTEND)
    └── Thêm section: Work Categories + Learning settings
```

### Dependency Injection Pattern

Tất cả classes nhận dependencies qua constructor (pattern đang dùng trong codebase):

```typescript
// Ví dụ: DocumentAnalyzer — tương tự CalendarTools hiện tại
export interface DocumentAnalyzerDeps {
  plugin: ObsidianCalendarAgentPlugin;
  geminiAgent: GeminiAgent;
  analysisHistory: AnalysisHistory;
  vaultContext: VaultContext;          // đã có trong plugin
  workCategoryConfig: WorkCategoryConfig;
}

export class DocumentAnalyzer {
  constructor(private deps: DocumentAnalyzerDeps) {}
}

// Trong main.ts (tương tự cách khởi tạo CalendarTools):
this.analysisHistory = new AnalysisHistory(this);
this.workCategoryConfig = new WorkCategoryConfig();
this.documentAnalyzer = new DocumentAnalyzer({
  plugin: this,
  geminiAgent: this.geminiAgent,
  analysisHistory: this.analysisHistory,
  vaultContext: this.vaultContext,
  workCategoryConfig: this.workCategoryConfig
});
```

---

## 3. DATA MODELS & FLOW

### 3.1 DocumentAnalysisResult (Output của analysis)

```typescript
interface DocumentAnalysisResult {
  jobTitle: string;
  description: string;
  category: WorkCategory;
  detectedKeywords: string[];
  deadline: string;                    // ISO date string
  estimatedDeadlineDays: number;       // User cần X ngày
  estimatedHours: number;              // Tổng effort estimate
  actionPlan: ActionStep[];            // Ordered steps
  actionPlanEstimates: Record<string, number>;  // Giờ mỗi bước
  requiredApprovals: string[];         // Ai cần phê duyệt
  riskLevel: "low" | "medium" | "high";
  patternInsights?: {
    similarTasksCount: number;
    averageDeadlineDays: number;
    estimateAccuracy: number;          // % match
    confidenceLevel: "high" | "medium" | "low";
  };
}

interface ActionStep {
  title: string;
  description?: string;
  estimatedHours: number;
  completed: boolean;
}
```

### 3.2 DocumentAnalysis (Lưu trong history)

```typescript
interface DocumentAnalysis {
  // Identity
  id: string;                          // UUIDv4 (dùng crypto.randomUUID())
  timestamp: string;                   // ISO string (như ChatMessage.createdAt)
  
  // Metadata
  category: WorkCategory;
  jobTitle: string;
  description?: string;
  detectedKeywords: string[];
  
  // Estimates
  estimatedDeadlineDays: number;
  estimatedHours: number;
  estimatedRiskLevel: "low" | "medium" | "high";
  
  // Actual (user cung cấp sau)
  actualDeadlineDays?: number;
  actualHours?: number;
  
  // Plan
  actionPlan: string[];
  actionPlanEstimates?: Record<string, number>;
  requiredApprovals?: string[];
  
  // Feedback
  userFeedback?: "accurate" | "too_short" | "too_long";
  feedbackComment?: string;
  
  // Linking
  googleTaskId?: string;               // ID task Google Tasks đã tạo
  googleEventId?: string;              // ID event Calendar đã tạo
  vaultNoteId?: string;                // Path ghi chú trong vault
}
```

### 3.3 PatternInsights (Tính từ history)

```typescript
interface PatternInsights {
  category: WorkCategory;
  
  // Statistics
  totalAnalyzed: number;
  avgDeadlineDays: number;             // Mean
  stdDevDays: number;                  // Standard deviation
  avgHours: number;
  stdDevHours: number;
  
  // Quality metrics
  estimateAccuracy: number;            // % estimate chính xác
  earlyCompletionRate: number;
  lateCompletionRate: number;
  
  // Patterns discovered
  commonKeywords: string[];
  frequentApprovers: string[];
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  
  // Metadata
  lastUpdated: string;                 // ISO string
  dataQuality: "high" | "medium" | "low";
}
```

### 3.4 WorkCategory Enum

```typescript
// Thêm vào types.ts
export enum WorkCategory {
  PH10_ASSET_MANAGEMENT = "PH10_ASSET_MANAGEMENT",
  PC06_WEAPON_LICENSE = "PC06_WEAPON_LICENSE",
  PV01_ADMIN_DOCS = "PV01_ADMIN_DOCS",
  DT_DIGITAL_TRANSFORM = "DT_DIGITAL_TRANSFORM",
  NQ57_IT_DEVELOPMENT = "NQ57_IT_DEVELOPMENT",
  ND85_INFO_SECURITY = "ND85_INFO_SECURITY",
  UNKNOWN = "UNKNOWN"
}
```

### 3.5 Data Flow Diagram

```
User Input (Image)
    ↓
DocumentAnalyzer.analyzeDocument(imageBase64)
    ↓
GeminiAgent.run(ocrPrompt, [], timezone, vaultSnapshot, signal, excludedTools, imageBase64)
    ↓ (Gemini Vision OCR — inlineData trong parts[])
text result
    ↓
classifyWorkCategory(text)  ← keyword matching, no AI needed
    ↓
AnalysisHistory.getPatternsForCategory(category)
    ↓ (đọc từ patterns-[category].json trong vault)
patterns: PatternInsights
    ↓
buildEnrichedPrompt(category, patterns, extractedText)
    ↓ (system prompt + pattern context + extracted text)
enriched prompt
    ↓
GeminiAgent.run(enrichedPrompt, [], timezone, vaultSnapshot)
    ↓ (AI phân tích với pattern context)
DocumentAnalysisResult (JSON trong assistantText)
    ↓
SafetyLayer.confirmAnalysis(result, patterns)
    ↓ (user xem + xác nhận trong Obsidian Modal)
User clicks [✅ Confirm]
    ↓
GoogleTasksAPI.createTask()  ← đã có trong codebase
GoogleCalendarAPI.createEvent()  ← đã có trong codebase
    ↓
AnalysisHistory.logAnalysis()
    ↓ (append to JSONL, update patterns JSON)
Vault note created  ← dùng plugin.app.vault.create()
    ↓
AnalysisHistory.recordFeedback()  [SAU này, khi user hoàn thành]
    ↓ (SyncManager phát hiện task completed)
Pattern recalculation
    ↓
Lần phân tích sau dùng improved patterns 🎯
```

---

## 4. GEMINI API INTEGRATION DETAILS

### 4.1 GeminiAgent Extension: Multimodal Support

**Implementation hiện tại (TEXT-ONLY):**

```typescript
// Trong GeminiAgent.ts — contents được build như sau:
const contents: GeminiContent[] = [
  systemTurn,  // { role: "user", parts: [{ text: systemPrompt }] }
  ...history,
  {
    role: "user",
    parts: [{ text: userMessage }]  // ← chỉ text
  }
];
```

**Implementation MỚI (có thể kèm image):**

```typescript
// GeminiPart (types.ts) — thêm inlineData:
export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; };
  functionResponse?: { name: string; response: Record<string, unknown>; };
  inlineData?: {                    // NEW
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    data: string;                   // base64 string
  };
}

// Trong GeminiAgent.run() — build user message parts:
const userParts: GeminiPart[] = [{ text: userMessage }];
if (imageBase64) {
  userParts.push({
    inlineData: {
      mimeType: "image/jpeg",
      data: imageBase64.replace(/^data:image\/\w+;base64,/, "") // strip data URL prefix
    }
  });
}

const contents: GeminiContent[] = [
  systemTurn,
  ...history,
  { role: "user", parts: userParts }
];
```

**Lưu ý quan trọng**: Gemini API đã hỗ trợ multimodal qua cùng endpoint `generateContent`. Không cần thay đổi URL hay authentication. Chỉ cần thêm `inlineData` part.

### 4.2 Function Calling với Multimodal

Gemini function calling vẫn hoạt động bình thường khi có ảnh trong `parts[]`:

1. User cung cấp: text + image
2. Gemini phân tích image + gọi tool (e.g., `analyze_document_image`)
3. Plugin thực thi tool
4. Response được feed lại vào Gemini (vòng lặp đã có trong `GeminiAgent.run()`)

### 4.3 Model Fallback (đang có sẵn)

```typescript
// GeminiAgent.MODEL_CANDIDATES (hiện tại):
private static readonly MODEL_CANDIDATES = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-pro-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b"
];
```

Tất cả models trên đều hỗ trợ multimodal (vision). Không cần thêm models mới.

---

## 5. JSONL STORAGE STRATEGY

### 5.1 Why JSONL?

| Feature | JSONL | JSON Array | SQLite |
|---------|-------|-----------|--------|
| Append-only | ✅ Efficient | ❌ Re-write entire file | ✅ Efficient |
| Auditable | ✅ Human-readable | ✅ Human-readable | ⚠️ Binary |
| Vault-native | ✅ Plain text | ✅ Plain text | ❌ Binary |
| Query speed | ⚠️ Line-by-line | ✅ Fast | ✅ Fast |
| Fail-safe | ✅ Corrupted line không break rest | ❌ Invalid JSON breaks file | ⚠️ |
| Complexity | ✅ Simple | ✅ Simple | ❌ Setup + migration |

**Decision:** JSONL tốt nhất cho use case này:
- Immutable audit trail
- Plain text (vault-native, git-trackable)
- Parse incrementally
- Nếu một dòng corrupt, phần còn lại vẫn an toàn

### 5.2 JSONL Format

**File:** `_document-analysis/metadata/analysis-history.jsonl`

```jsonl
{"id":"uuid-1","timestamp":"2026-06-16T10:30:00Z","category":"PH10_ASSET_MANAGEMENT","jobTitle":"Báo cáo tài sản quý 2","detectedKeywords":["báo cáo","tài sản","quý"],"estimatedDeadlineDays":5,"estimatedHours":4,"actionPlan":["Kiểm tra","Thu thập","Xây dựng","Review","Nộp"],"requiredApprovals":["PH10_Manager"],"riskLevel":"low","googleTaskId":"task-123","vaultNoteId":"_document-analysis/by-date/2026-06/2026-06-16-PH10-bao-cao-tai-san.md"}
{"id":"uuid-2","timestamp":"2026-06-15T14:45:00Z","category":"PV01_ADMIN_DOCS","jobTitle":"Công văn thông báo","estimatedDeadlineDays":3,"estimatedHours":2,"actualDeadlineDays":2,"actualHours":1.5,"userFeedback":"accurate"}
```

**Parsing strategy (dùng pattern từ SyncManager.ts):**

```typescript
private async readAnalysisHistory(): Promise<DocumentAnalysis[]> {
  const filePath = "_document-analysis/metadata/analysis-history.jsonl";
  const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return [];
  
  const fileContent = await this.plugin.app.vault.read(file);
  return fileContent
    .split("\n")
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line) as DocumentAnalysis;
      } catch (e) {
        console.error("[AnalysisHistory] Failed to parse JSONL line:", e);
        return null;
      }
    })
    .filter(Boolean) as DocumentAnalysis[];
}
```

### 5.3 Appending New Entries

```typescript
// Pattern tương tự CalendarTools.execAppendVaultNote()
async logAnalysis(analysis: DocumentAnalysis): Promise<string> {
  const filePath = "_document-analysis/metadata/analysis-history.jsonl";
  const jsonlLine = JSON.stringify(analysis) + "\n";
  
  const normalized = normalizePath(filePath);
  const file = this.plugin.app.vault.getAbstractFileByPath(normalized);
  
  if (file instanceof TFile) {
    const currentContent = await this.plugin.app.vault.read(file);
    await this.plugin.app.vault.modify(file, currentContent + jsonlLine);
  } else {
    // Tạo folder nếu chưa có (pattern từ CalendarTools.execWriteVaultNote)
    await this.plugin.app.vault.createFolder("_document-analysis/metadata");
    await this.plugin.app.vault.create(normalized, jsonlLine);
  }
  
  return analysis.id;
}
```

---

## 6. PATTERN CALCULATION LOGIC

### 6.1 Computing PatternInsights từ History

```typescript
async getPatternsForCategory(category: WorkCategory): Promise<PatternInsights> {
  const analyses = await this.getHistoryByCategory(category);
  
  if (analyses.length === 0) {
    return this.getDefaultPatterns(category);
  }
  
  const deadlineDays = analyses
    .filter(a => a.estimatedDeadlineDays)
    .map(a => a.estimatedDeadlineDays);
  
  const hours = analyses
    .filter(a => a.estimatedHours)
    .map(a => a.estimatedHours);
  
  // Statistics
  const avgDays = mean(deadlineDays);
  const stdDevDays = stdDev(deadlineDays);
  const avgHours = mean(hours);
  const stdDevHours = stdDev(hours);
  
  // Accuracy từ feedback
  const estimateAccuracy = this.calculateAccuracy(analyses);
  
  // Patterns
  const allKeywords = analyses.flatMap(a => a.detectedKeywords);
  const commonKeywords = topN(allKeywords, 10);
  
  return {
    category,
    totalAnalyzed: analyses.length,
    avgDeadlineDays: Math.round(avgDays * 10) / 10,
    stdDevDays: Math.round(stdDevDays * 10) / 10,
    avgHours: Math.round(avgHours * 10) / 10,
    stdDevHours: Math.round(stdDevHours * 10) / 10,
    estimateAccuracy,
    commonKeywords,
    frequentApprovers: topN(analyses.flatMap(a => a.requiredApprovals ?? []), 5),
    riskDistribution: {
      low: (analyses.filter(a => a.estimatedRiskLevel === "low").length / analyses.length) * 100,
      medium: (analyses.filter(a => a.estimatedRiskLevel === "medium").length / analyses.length) * 100,
      high: (analyses.filter(a => a.estimatedRiskLevel === "high").length / analyses.length) * 100,
    },
    lastUpdated: new Date().toISOString(),
    dataQuality: analyses.length >= 10 ? "high" : analyses.length >= 5 ? "medium" : "low",
  };
}

private calculateAccuracy(analyses: DocumentAnalysis[]): number {
  const withFeedback = analyses.filter(a => a.userFeedback);
  if (withFeedback.length === 0) return 85;  // Default confidence
  
  const accurate = withFeedback.filter(a => a.userFeedback === "accurate").length;
  return Math.round((accurate / withFeedback.length) * 100);
}
```

### 6.2 Updating Patterns After Feedback

```typescript
async recordFeedback(
  analysisId: string,
  actual: { deadlineDays: number; hours: number; feedback: "accurate" | "too_short" | "too_long" }
): Promise<void> {
  // 1. Đọc toàn bộ JSONL
  const analyses = await this.readAnalysisHistory();
  
  // 2. Tìm và update entry
  const updated = analyses.map(a =>
    a.id === analysisId
      ? {
          ...a,
          actualDeadlineDays: actual.deadlineDays,
          actualHours: actual.hours,
          userFeedback: actual.feedback
        }
      : a
  );
  
  // 3. Rewrite JSONL
  await this.writeAnalysisHistory(updated);
  
  // 4. Recalculate patterns cho category
  const entry = analyses.find(a => a.id === analysisId);
  if (entry) {
    const patterns = await this.getPatternsForCategory(entry.category);
    await this.savePatternFile(entry.category, patterns);
  }
}
```

---

## 7. ENRICHED PROMPT STRATEGY

### 7.1 Base System Prompt (từ WorkCategoryConfig)

Mỗi category có base system prompt:

```
Bạn là chuyên gia phân tích công việc quản lý tài sản (PH10).

Quy trình tiêu biểu:
1. Kiểm tra hệ thống tài sản hiện có (1h)
2. Thu thập thông tin từ các đơn vị (1h)
3. Xây dựng bản báo cáo (1.5h)
4. Review với PH10 (0.5h)
5. Nộp lên cấp trên

Thời gian tiêu biểu: 5-7 ngày làm việc
Yêu cầu: Xác thực số liệu, kiểm tra từng mục
Cảnh báo: Thường có follow-up, predict 2-3 bộ phận cần involved
```

### 7.2 Context từ History (Inject vào prompt)

```
DỰA TRÊN LỊCH SỬ 12 CÔNG VIỆC TƯƠNG TỰ:
- Deadline trung bình: 5.2 ngày (±0.8)
- Thời gian thực tế: 4.2 giờ (±0.7)
- Độ chính xác của AI: 92% (11/12 estimate chính xác)
- Keywords thường gặp: báo cáo, tài sản, quý, kiểm kê

Người phê duyệt thường gặp: PH10_Manager (100%)
Mức rủi ro thường gặp: 85% low, 12% medium, 3% high

LƯU Ý: Nếu estimate của bạn lệch quá so với pattern (>20%), hãy
giải thích chi tiết tại sao công việc này khác biệt.
```

### 7.3 Full Enriched Prompt

```
[Base system prompt từ WorkCategoryConfig]

[Context từ AnalysisHistory patterns]

Bây giờ, phân tích công việc sau dựa trên text OCR từ ảnh:

[OCR-extracted text từ Gemini Vision]

Yêu cầu phân tích (trả về JSON):
{
  "jobTitle": "...",
  "deadline": "YYYY-MM-DD",
  "estimatedDeadlineDays": number,
  "estimatedHours": number,
  "category": "PH10_ASSET_MANAGEMENT",
  "detectedKeywords": [...],
  "actionPlan": [...],
  "requiredApprovals": [...],
  "riskLevel": "low|medium|high"
}
```

---

## 8. SAFETY & CONFIRMATION FLOW

### 8.1 SafetyLayer Extension

```typescript
// Trong SafetyLayer.ts
export type SafetyActionType = 
  | "create_event" 
  | "update_event" 
  | "delete_event" 
  | "write_note"
  | "analyze_document";  // NEW

// Method mới
async confirmAnalysis(
  analysis: DocumentAnalysisResult,
  patterns: PatternInsights
): Promise<{ confirmed: boolean; editedAnalysis?: DocumentAnalysisResult }> {
  return new Promise((resolve) => {
    const modal = new DocumentAnalysisConfirmModal(
      this.plugin,
      analysis,
      patterns,
      resolve
    );
    modal.open();
  });
}
```

### 8.2 DocumentAnalysisConfirmModal

```typescript
class DocumentAnalysisConfirmModal extends Modal {
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    // Header
    contentEl.createEl("h2", { text: this.analysis.jobTitle });
    
    // Category + Deadline
    const meta = contentEl.createDiv({ cls: "oca-analysis-meta" });
    meta.createEl("span", { text: `📁 ${this.analysis.category}`, cls: "oca-category-badge" });
    meta.createEl("span", { text: `⏰ ${this.analysis.deadline}` });
    meta.createEl("span", { text: `🕐 ${this.analysis.estimatedHours}h` });
    
    // Pattern Insights
    if (this.patterns.totalAnalyzed > 0) {
      const insight = contentEl.createDiv({ cls: "oca-pattern-insight" });
      insight.createEl("strong", { text: `✓ ${this.patterns.totalAnalyzed} công việc tương tự: avg ${this.patterns.avgDeadlineDays} ngày` });
    }
    
    // Action Plan (checklist)
    const planSection = contentEl.createDiv({ cls: "oca-action-plan" });
    planSection.createEl("h4", { text: "Action Plan:" });
    for (const step of this.analysis.actionPlan) {
      const item = planSection.createEl("label");
      item.createEl("input", { type: "checkbox" });
      item.appendText(` ${step.title} (${step.estimatedHours}h)`);
    }
    
    // Buttons
    const buttonRow = contentEl.createDiv({ cls: "oca-confirm-actions" });
    
    const addBtn = buttonRow.createEl("button", { text: "✅ Add to Calendar", cls: "mod-cta" });
    addBtn.onclick = () => { this.finish({ confirmed: true }); this.close(); };
    
    const editBtn = buttonRow.createEl("button", { text: "✏️ Edit" });
    editBtn.onclick = () => { this.finish({ confirmed: false }); this.close(); };
    
    const cancelBtn = buttonRow.createEl("button", { text: "❌ Cancel" });
    cancelBtn.onclick = () => { this.finish({ confirmed: false }); this.close(); };
  }
}
```

### 8.3 Error Handling

```typescript
// Trong CalendarView.sendMessage() hoặc command handler
try {
  const analysis = await this.documentAnalyzer.analyzeDocument(imageBase64);
  const { confirmed } = await this.safetyLayer.confirmAnalysis(analysis, patterns);
  
  if (confirmed) {
    await this.calendarTools.executeTool({ name: "create_task_from_analysis", arguments: analysis });
    await this.analysisHistory.logAnalysis(analysis as DocumentAnalysis);
    new Notice(`✅ Đã thêm: ${analysis.jobTitle}`);
  }
} catch (error) {
  console.error("[DocumentAnalyzer] analyzeDocument failed", error);
  new Notice(`Lỗi phân tích: ${(error as Error).message}`);
}
```

---

## 9. PERFORMANCE CONSIDERATIONS

### 9.1 Image Processing

```typescript
private parseImageBase64(imageData: string): string {
  // Strip data URL prefix nếu có (vd: "data:image/jpeg;base64,...")
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
  
  // Validate size (Gemini limit: ~20MB, nhưng nên giới hạn 5MB)
  const estimatedBytes = (base64.length * 3) / 4;
  if (estimatedBytes > 5 * 1024 * 1024) {
    throw new Error("Ảnh quá lớn (>5MB). Vui lòng nén hoặc resize.");
  }
  
  return base64;
}
```

### 9.2 Pattern Recalculation

Chỉ recalculate khi cần thiết:

```typescript
async recordFeedback(...): Promise<void> {
  // Update JSONL
  // ...
  
  // Recalculate mỗi 5 feedback (tránh tính toán liên tục)
  const feedbackCount = analyses.filter(a => a.userFeedback).length;
  if (feedbackCount % 5 === 0 || feedbackCount === 1) {
    await this.recalculatePatternsForCategory(category);
  }
}
```

### 9.3 Bundle Size Tracking

- DocumentAnalyzer.ts: ~4KB source, ~2KB minified
- AnalysisHistory.ts: ~6KB source, ~3KB minified
- WorkCategoryConfig.ts: ~5KB source, ~2KB minified
- InsightsDashboard.ts: ~4KB source, ~2KB minified
- Extensions to existing files: ~3KB total
- **Tổng new code:** ~14KB minified
- **Current main.js:** ~111KB
- **New total estimate:** ~125KB (acceptable)

---

## 10. TESTING STRATEGY

### 10.1 Unit Tests (nếu setup test runner)

```typescript
describe("DocumentAnalyzer", () => {
  it("should extract text from image via Gemini", async () => {
    // Mock GeminiAgent.run()
    const mockGeminiAgent = { run: jest.fn().mockResolvedValue({ assistantText: "Báo cáo tài sản..." }) };
    const analyzer = new DocumentAnalyzer({ geminiAgent: mockGeminiAgent, ... });
    const result = await analyzer.analyzeDocument("base64imagedata");
    expect(result.jobTitle).toBeDefined();
  });
  
  it("should classify category by keywords", () => {
    const analyzer = new DocumentAnalyzer(...);
    const category = analyzer.classifyWorkCategory("báo cáo quản lý tài sản");
    expect(category).toBe(WorkCategory.PH10_ASSET_MANAGEMENT);
  });
});
```

### 10.2 Manual Test Checklist

```bash
# 1. Build thành công
npm run build
# → Should output: "Build complete" in esbuild.config.mjs

# 2. Kiểm tra bundle size
ls -la d:\smartcalendar\main.js
# → Should be < 200KB (hiện tại 111KB)

# 3. Load plugin trong Obsidian (developer mode)
# → No console errors on load

# 4. Test command "Phân tích tài liệu"
# → Modal mở được

# 5. Test với ảnh thật
# → OCR hoạt động, category được phân loại đúng
```

---

## 11. DEPLOYMENT & VERSIONING

### 11.1 Manifest Update

```json
// manifest.json — hiện tại version 0.0.1
{
  "id": "obsidian-calendar-agent",
  "name": "Obsidian Calendar Agent",
  "version": "1.0.0",               // ← bump khi release Document Analyzer
  "minAppVersion": "1.5.0",
  "description": "Gemini-powered calendar management with document analysis & self-learning",
  "author": "calendar-agent",
  "isDesktopOnly": false
}
```

### 11.2 Release Checklist

- [ ] npm run build thành công, không có TypeScript errors
- [ ] Bundle size hợp lý
- [ ] Không có console errors khi load plugin
- [ ] Manual QA với 5+ tài liệu thật
- [ ] Cập nhật README.md với tính năng mới
- [ ] Tạo git tag: `v1.0.0`

---

## 12. FUTURE EXTENSIBILITY

### 12.1 Thêm Work Category Mới

```typescript
// Chỉ cần thêm vào WorkCategoryConfig:
[WorkCategory.MY_NEW_CATEGORY]: {
  displayName: "My New Category",
  keywords: ["keyword1", "keyword2"],
  defaultDeadlineDays: 7,
  estimatedEffortHours: 5,
  actionPlanTemplate: ["Step 1", "Step 2"],
  systemPrompt: "Bạn là chuyên gia về..."
}
```

### 12.2 Thêm Tool Mới vào CalendarTools

```typescript
// Dùng executor registry pattern (đã có):
// 1. Thêm vào this.executors trong constructor
// 2. Thêm vào getGeminiToolDeclarations()
// 3. Implement execMyNewTool() method
```

---

**Document Version:** 2.0 (updated to match actual codebase)  
**Last Updated:** 2026-06-16  
**Key Changes từ v1.0:**
- Sửa API code examples (dùng Gemini REST + requestUrl, không phải Anthropic/fetch)
- Cập nhật GeminiAgent.run() signature thực tế
- Cập nhật executor pattern từ CalendarTools.ts thực tế  
- Cập nhật SafetyActionType types thực tế
- Cập nhật bundle size estimate (main.js thực tế = 111KB)
- Cập nhật version target (0.0.1 → 1.0.0 thay vì 2.0.0)
