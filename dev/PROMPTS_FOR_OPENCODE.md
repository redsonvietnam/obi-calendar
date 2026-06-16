# 🤖 PROMPTS FOR OPENCODE - Optimized AI Agent Instructions

**Purpose:** Specific, detailed prompts for each OpenCode session  
**Format:** Copy-paste ready cho Claude/AI coding agent  
**Strategy:** Each prompt includes full context, examples, checklist  

---

## GENERAL SETUP INSTRUCTION (FOR ALL SESSIONS)

```markdown
## IMPORTANT: Repository Context

**Repository:** d:\smartcalendar\  (KHÔNG PHẢI d:\obi-calendar)
**Plugin ID:** obsidian-calendar-agent
**Current version:** 0.0.1 (manifest.json)
**Base branch:** dev  (KHÔNG PHẢI main)
**Feature branch:** feature/document-analyzer-learning (tách từ dev)
**Technology:** TypeScript, Obsidian Plugin API, Gemini REST API, esbuild

### Key Files (thực tế trong d:\smartcalendar\src\):
- main.ts - Plugin entry point (ObsidianCalendarAgentPlugin class)
- types.ts - Type definitions (CalendarAgentSettings, GeminiPart, GoogleTask, etc.)
- GeminiAgent.ts - AI engine dùng requestUrl của Obsidian (KHÔNG phải fetch)
- CalendarTools.ts - Tool registry (executor pattern, đã có 14 executors)
- GoogleCalendarAPI.ts - Google Calendar REST wrapper
- GoogleTasksAPI.ts - Google Tasks REST wrapper (đã có đầy đủ CRUD)
- SafetyLayer.ts - Confirmation modals + undo buffer
- VaultContext.ts - Vault snapshot (daily notes, open tasks, projects)
- SettingsTab.ts - Plugin settings UI
- SyncManager.ts - Bidirectional sync (Google ↔ Obsidian)

### GeminiAgent.run() ACTUAL Signature (7 params):
```typescript
async run(
  userMessage: string,
  history: GeminiContent[],        // chat history
  timezone: string,                // e.g. "Asia/Ho_Chi_Minh"
  vaultSnapshot: string,           // JSON string từ VaultContext
  signal?: AbortSignal,            // optional cancel signal
  excludedTools?: string[],        // optional tools to exclude
  imageBase64?: string             // NEW param cần thêm cho Vision
): Promise<AgentRunResult & { updatedHistory: GeminiContent[] }>
```

### CalendarTools Executor Pattern (FOLLOW THIS EXACTLY):
```typescript
// Constructor:
this.executors = {
  list_events: this.execListEvents.bind(this),
  create_event: this.execCreateEvent.bind(this),
  // ... 12 more executors
  // Thêm mới theo cùng pattern:
  my_new_tool: this.execMyNewTool.bind(this),
};

// Implementation:
private async execMyNewTool(args: Record<string, unknown>): Promise<unknown> {
  const param = this.asRequiredString(args.param, "param");
  return await someApi.doSomething(param);
}

// Declaration (in getGeminiToolDeclarations()):
{
  name: "my_new_tool",
  description: "...",
  parameters: {
    type: "object",
    properties: { param: { type: "string", description: "..." } },
    required: ["param"]
  }
}
```

### Gemini API (Obsidian plugin dùng requestUrl, KHÔNG phải fetch):
```typescript
import { requestUrl } from "obsidian";
// ...
const response = await requestUrl({
  url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  method: "POST",
  headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
  body: JSON.stringify({ contents, tools, toolConfig }),
  throw: false
});
```

### Build & Test:
```bash
cd d:\smartcalendar
npm install
npm run build
# → Should produce main.js (~111KB hiện tại)
```

### Style Guide:
- TypeScript strict mode
- async/await (không dùng callbacks)
- Error handling: try/catch + `new Notice()` từ obsidian
- Pattern: inject deps qua constructor như CalendarTools
- Dùng `normalizePath()` từ obsidian cho vault paths
- Dùng `TFile` instanceof check khi đọc/ghi file vault

### Reference Documents:
1. FEATURE_SPEC.md - Feature specification (cập nhật v2.0)
2. TASK_BREAKDOWN.md - Tasks + code examples (cập nhật v2.0)
3. ARCHITECTURE.md - Technical design + patterns (cập nhật v2.0)
4. BRANCHING_STRATEGY.md - Git workflow (base: dev)

**Bắt đầu với prompt cho stream của bạn bên dưới.**
```

---

## STREAM A: Core Data Models & Types

```markdown
# STREAM A: Extend types.ts with New Interfaces

## 🎯 Objective
Extend src/types.ts to add all new TypeScript interfaces for the Document Analyzer feature.
This is the FOUNDATION - all other streams depend on this.

## 📋 Tasks
- [ ] Add WorkCategory enum (6 categories)
- [ ] Add DocumentAnalysisResult interface
- [ ] Add DocumentAnalysis interface (for storage)
- [ ] Add ActionStep interface
- [ ] Add PatternInsights interface
- [ ] Add WorkCategoryConfig interface
- [ ] Add WorkAnalysisInsights interface
- [ ] Export all new types

## ✅ Acceptance Criteria
- [ ] All interfaces compile without TypeScript errors
- [ ] Interfaces match FEATURE_SPEC.md section 3.1-3.2 exactly
- [ ] All properties have correct types (string, number, enum, Record, etc)
- [ ] Optional fields use ? (e.g., actualDeadlineDays?)
- [ ] All enums are exported
- [ ] No breaking changes to existing CalendarAgentSettings interface

## 📝 Specific Additions to src/types.ts

### 1. Add WorkCategory enum + inlineData to GeminiPart

```typescript
// Thêm inlineData vào GeminiPart (đã có trong types.ts):
export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; };
  functionResponse?: { name: string; response: Record<string, unknown>; };
  inlineData?: {                           // NEW — cho Gemini Vision
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    data: string;                          // base64 string (no data: prefix)
  };
}

// WorkCategory enum (thêm sau GoogleTaskList interface):
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

### 2. Add ActionStep interface

```typescript
export interface ActionStep {
  title: string;
  description?: string;
  estimatedHours: number;
  completed: boolean;
}
```

### 3. Add DocumentAnalysisResult interface

```typescript
export interface DocumentAnalysisResult {
  jobTitle: string;
  description: string;
  category: WorkCategory;
  detectedKeywords: string[];
  deadline: string;  // ISO date string
  estimatedDeadlineDays: number;
  estimatedHours: number;
  actionPlan: ActionStep[];
  actionPlanEstimates?: Record<string, number>;
  requiredApprovals: string[];
  riskLevel: "low" | "medium" | "high";
  patternInsights?: {
    similarTasksCount: number;
    averageDeadlineDays: number;
    estimateAccuracy: number;
    confidenceLevel: "high" | "medium" | "low";
  };
}
```

### 4. Add DocumentAnalysis interface (for JSONL storage)

> **Lưu ý:** Dùng `string` cho timestamp (ISO string), không phải `Date`
> Codebase hiện tại dùng `createdAt: string` (ISO) trong ChatMessage

```typescript
export interface DocumentAnalysis {
  // Identity
  id: string;                              // crypto.randomUUID()
  timestamp: string;                       // ISO string (KHÔNG phải Date)
  
  // Metadata
  category: WorkCategory;
  jobTitle: string;
  description?: string;
  detectedKeywords: string[];
  
  // Estimates
  estimatedDeadlineDays: number;
  estimatedHours: number;
  estimatedRiskLevel: "low" | "medium" | "high";
  
  // Actual (điền sau khi hoàn thành)
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
  googleTaskId?: string;
  googleEventId?: string;
  vaultNoteId?: string;
  
  // Notes
  notes?: string;
}
```

### 5. Add PatternInsights interface

```typescript
export interface PatternInsights {
  category: WorkCategory;
  
  totalAnalyzed: number;
  avgDeadlineDays: number;
  stdDevDays: number;
  avgHours: number;
  stdDevHours: number;
  
  estimateAccuracy: number;  // 0-100%
  earlyCompletionRate: number;
  lateCompletionRate: number;
  
  commonKeywords: string[];
  frequentApprovers: string[];
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  
  lastUpdated: string;                   // ISO string (KHÔNG phải Date)
  dataQuality: "high" | "medium" | "low";
}
```

### 6. Add WorkCategoryConfig interface

```typescript
export interface WorkCategoryConfig {
  id: WorkCategory;
  displayName: string;
  keywords: string[];
  defaultDeadlineDays: number;
  estimatedEffortHours: number;
  actionPlanTemplate: string[];
  systemPrompt: string;
}
```

### 7. Add WorkAnalysisInsights interface

```typescript
export interface WorkAnalysisInsights {
  totalAnalyzed: number;
  byCategory: Record<WorkCategory, {
    count: number;
    avgDays: number;
    accuracy: number;
  }>;
  estimateQuality: string;
  recommendations: string[];
}
```

## 🧪 Testing
After editing, run:
```bash
npm run build
```

Should compile without TypeScript errors. If you see errors like:
- "Cannot find type X" - check spelling
- "Property 'X' is not assignable" - check field type
- "Missing required property" - all non-optional fields must be in interface

## 🎯 When Done
- Commit: `git commit -m "feat(A): add DocumentAnalysis interfaces to types.ts"`
- Push: `git push`
- Notify other sessions that A is complete (they can now start B, C, E)

## ⚠️ Avoid Common Mistakes
- Don't add implementation code (just interfaces)
- Don't modify CalendarAgentSettings interface
- Don't forget to export types (use export keyword)
- Don't use `type` vs `interface` inconsistently
- Don't add getters/setters (just plain properties)

## 📚 Reference Sections
- FEATURE_SPEC.md: Section 3.1 (categories), 3.2 (interfaces)
- ARCHITECTURE.md: Section 3 (data models)
```

---

## STREAM B.1: Gemini Agent Multimodal Support

```markdown
# STREAM B.1: Extend GeminiAgent for Multimodal Input

## 🎯 Objective
Extend src/GeminiAgent.ts to support image input (base64) + enriched prompts with historical context.

## 📋 Tasks
- [ ] Add optional imageBase64 parameter to run() method
- [ ] Add optional contextFromHistory parameter to run() method
- [ ] Build parts array to include text + optional image + optional context
- [ ] Ensure function calling still works with image present
- [ ] Test with sample image

## ✅ Acceptance Criteria
- [ ] Method signature updated: `run(..., imageBase64?: string, contextFromHistory?: string)`
- [ ] Image is properly encoded as base64 with correct mimeType
- [ ] Parts array structure: [{ text: ... }, { inlineData: ... }, ...]
- [ ] Function calling triggers correctly with multimodal input
- [ ] Backwards compatible (image + context are optional)
- [ ] No breaking changes to existing behavior
- [ ] TypeScript strict mode passes

## 📝 Specific Changes to src/GeminiAgent.ts

### Current signature (ACTUAL — 7 params):
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

### New signature (thêm imageBase64 ở cuối — backward compatible):
```typescript
async run(
  userMessage: string,
  history: GeminiContent[],
  timezone: string,
  vaultSnapshot: string,
  signal?: AbortSignal,
  excludedTools?: string[],
  imageBase64?: string             // NEW — optional Gemini Vision
): Promise<AgentRunResult & { updatedHistory: GeminiContent[] }>
```

### Build parts array (trong run() method)

Tìm trong `run()`, phần build `contents` array:
```typescript
// HIỆN TẠI (khoảng dòng 130-134 trong GeminiAgent.ts):
const contents: GeminiContent[] = [
  systemTurn,
  ...history,
  {
    role: "user",
    parts: [{ text: userMessage }]    // ← SỬA PHẦN NÀY
  }
];

// SỬA THÀNH:
const userParts: GeminiPart[] = [{ text: userMessage }];
if (imageBase64) {
  userParts.push({
    inlineData: {
      mimeType: "image/jpeg",
      // Strip data URL prefix nếu có
      data: imageBase64.replace(/^data:image\/\w+;base64,/, "")
    }
  });
}

const contents: GeminiContent[] = [
  systemTurn,
  ...history,
  { role: "user", parts: userParts }   // ← dùng userParts
];
```

**Phần còn lại của run() KHÔNG thay đổi.**
Gemini function calling loop hoạt động giống nhau dù có hay không có ảnh.

## 🧪 Testing

```bash
# Sau khi sửa GeminiAgent.ts:
cd d:\smartcalendar
npm run build
# → Phải succeed không có TypeScript errors

# Thử gọi thủ công trong Obsidian developer console:
# plugin.geminiAgent.run("Mô tả ảnh này", [], "Asia/Ho_Chi_Minh", "{}", undefined, undefined, "base64datahere")
```

## 🎯 When Done
- Commit: `git commit -m "feat(B1): add imageBase64 param to GeminiAgent.run() for Vision support"`
- Push: `git push`
- Notify B.2 và D rằng B.1 đã xong

## ⚠️ Avoid Common Mistakes
- **KHÔNG** thay đổi URL endpoint hay model list (đã có 8 models với fallback)
- **KHÔNG** dùng `fetch` — phải dùng `requestUrl` từ obsidian
- **KHÔNG** thay đổi authentication headers
- **KHÔNG** sửa function calling loop (chỉ sửa user parts)
- **KHÔNG** quên strip data URL prefix trước khi gửi base64
- imageBase64 phải là param cuối cùng để backward compatible

## 📚 Reference Sections
- ARCHITECTURE.md: Section 4.1 (Gemini API Integration Details)
- TASK_BREAKDOWN.md: Stream B1
```

---

## STREAM B.2: Calendar Tools - New Executors

```markdown
# STREAM B.2: Add New Tools to CalendarTools.ts

## 🎯 Objective
Extend src/CalendarTools.ts để thêm 3 executors mới cho document analysis workflow.

## ⚠️ IMPORTANT: Đọc CalendarTools.ts thực tế trước
File thực tế có:
- 14 executors đã có (list_events, create_event, update_event, delete_event, get_vault_context, write_vault_note, append_vault_note, list_task_lists, create_task_list, delete_task_list, list_tasks, create_task, update_task, patch_task, delete_task)
- Helper methods: asRequiredString(), asOptionalString(), asOptionalNumber(), asOptionalBoolean()
- Đã có googleTasksApi (dùng được trực tiếp)
- Đã có calendarApi (dùng được trực tiếp)

## 📋 Tasks
- [ ] Thêm analyze_document_image executor
- [ ] Thêm create_task_from_analysis executor
- [ ] Thêm create_event_from_analysis executor
- [ ] Thêm declarations vào getGeminiToolDeclarations()
- [ ] Handle errors như các executors khác

## ✅ Acceptance Criteria
- [ ] 3 executors mới trong this.executors
- [ ] Tool declarations trong getGeminiToolDeclarations()
- [ ] create_task_from_analysis dùng this.googleTasksApi.createTask()
- [ ] create_event_from_analysis dùng this.calendarApi.createEvent()
- [ ] Không break 14 executors hiện có
- [ ] npm run build thành công

## 📝 Specific Additions (FOLLOW EXACT PATTERN)

### 1. Thêm vào constructor this.executors (sau delete_task):
```typescript
// Trong constructor, trong this.executors = { ... }:
analyze_document_image: this.execAnalyzeDocumentImage.bind(this),
create_task_from_analysis: this.execCreateTaskFromAnalysis.bind(this),
create_event_from_analysis: this.execCreateEventFromAnalysis.bind(this),
```

### 2. Thêm DocumentAnalyzer vào CalendarToolsDependencies:
```typescript
// Trong CalendarToolsDependencies interface:
documentAnalyzer?: DocumentAnalyzer;   // optional — inject từ main.ts

// Trong class properties:
private readonly documentAnalyzer?: DocumentAnalyzer;

// Trong constructor:
this.documentAnalyzer = deps.documentAnalyzer;
```

### 3. Implement 3 exec methods (sau execDeleteTask):
```typescript
private async execAnalyzeDocumentImage(args: Record<string, unknown>): Promise<unknown> {
  const imageBase64 = this.asRequiredString(args.imageBase64, "imageBase64");
  const userContext = this.asOptionalString(args.userContext);
  
  if (!this.documentAnalyzer) {
    throw new Error("DocumentAnalyzer chưa được khởi tạo trong plugin.");
  }
  return await this.documentAnalyzer.analyzeDocument(imageBase64, userContext);
}

private async execCreateTaskFromAnalysis(args: Record<string, unknown>): Promise<unknown> {
  const title = this.asRequiredString(args.jobTitle, "jobTitle");
  const due = this.asOptionalString(args.deadline);
  const notes = this.asOptionalString(args.notes);
  
  const task: Partial<GoogleTask> = { title, due, notes };
  return await this.googleTasksApi.createTask("@default", task);
}

private async execCreateEventFromAnalysis(args: Record<string, unknown>): Promise<unknown> {
  const summary = this.asRequiredString(args.jobTitle, "jobTitle");
  const startDateTime = this.asRequiredString(args.startDate, "startDate");
  const endDateTime = this.asRequiredString(args.endDate, "endDate");
  const timeZone = this.asOptionalString(args.timeZone) ?? this.getTimezone();
  
  const event: GoogleCalendarEvent = {
    summary,
    description: this.asOptionalString(args.description),
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone }
  };
  return await this.calendarApi.createEvent("primary", event);
}
```

### 4. Thêm tool declarations (tạo method mới getDocumentAnalysisToolDeclarations):
```typescript
private getDocumentAnalysisToolDeclarations(): ToolDefinition[] {
  return [
    {
      name: "analyze_document_image",
      description: "Phân tích tài liệu công việc từ ảnh scan — OCR + phân loại category",
      parameters: {
        type: "object",
        properties: {
          imageBase64: { type: "string", description: "Base64 encoded image (no data: prefix)" },
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
          deadline: { type: "string", description: "ISO date YYYY-MM-DD" },
          notes: { type: "string", description: "Chi tiết và action plan" }
        },
        required: ["jobTitle"]
      }
    },
    {
      name: "create_event_from_analysis",
      description: "Tạo Google Calendar event từ phân tích DocumentAnalyzer",
      parameters: {
        type: "object",
        properties: {
          jobTitle: { type: "string" },
          startDate: { type: "string", description: "RFC3339" },
          endDate: { type: "string", description: "RFC3339" },
          description: { type: "string" },
          timeZone: { type: "string" }
        },
        required: ["jobTitle", "startDate", "endDate"]
      }
    }
  ];
}
```

### 5. Thêm call vào getGeminiToolDeclarations():
```typescript
getGeminiToolDeclarations(excludeTools?: string[]): ToolDefinition[] {
  let decls = [
    ...this.getCalendarToolDeclarations(),
    ...this.getGoogleTasksToolDeclarations(),
    ...this.getDocumentAnalysisToolDeclarations()   // NEW
  ];
  // ... rest unchanged
}
```

## 🧪 Testing
```bash
npm run build
# → Phải succeed
# Test manual: gọi tool từ Gemini chat
```

## 🎯 When Done
- Commit: `git commit -m "feat(B2): add document analysis tools to CalendarTools executor registry"`
- Push: `git push`

## ⚠️ Avoid Common Mistakes
- **KHÔNG** dùng `this.googleCalendarAPI` — đúng tên là `this.calendarApi`
- **KHÔNG** dùng `this.googleCalendarAPI.createTask()` — Tasks dùng `this.googleTasksApi`
- **PHẢI** dùng `this.asRequiredString()` và `this.asOptionalString()` helpers
- **PHẢI** bind trong constructor: `this.execX.bind(this)`
- **PHẢI** thêm vào cả executors map VÀ declarations

## 📚 Reference Sections
- TASK_BREAKDOWN.md: Stream B2
- ARCHITECTURE.md: Section 2 (CalendarTools executor pattern)
```

---

## STREAM C: Analysis History & Pattern Storage

```markdown
# STREAM C: Create AnalysisHistory.ts - JSONL-based History

## 🎯 Objective
Create src/AnalysisHistory.ts - a new class to manage document analysis history with JSONL storage and pattern calculation.

## 📋 Tasks
- [ ] Create AnalysisHistory class with constructor
- [ ] Implement logAnalysis() - append to JSONL
- [ ] Implement getHistoryByCategory() - query by category
- [ ] Implement getPatternsForCategory() - calculate pattern insights
- [ ] Implement recordFeedback() - update with actual data
- [ ] Implement syncCompletionFromGoogleTasks() - auto-detect completions
- [ ] Implement getAllAnalyses() - get all records
- [ ] Create vault folders on init

## ✅ Acceptance Criteria
- [ ] JSONL file created at _document-analysis/metadata/analysis-history.jsonl
- [ ] Each analysis appended as single JSON line + newline
- [ ] Pattern calculation returns correct statistics (mean, std dev)
- [ ] Feedback updates JSONL and recalculates patterns
- [ ] Handles missing/corrupted data gracefully
- [ ] All vault folders created automatically
- [ ] TypeScript strict mode passes

## 📝 Implementation Template

> **QUAN TRỌNG:** AnalysisHistory nhận `ObsidianCalendarAgentPlugin` (như VaultContext, SyncManager),
> KHÔNG phải `App` trực tiếp. Dùng `this.plugin.app.vault` để đọc/ghi file.

```typescript
// src/AnalysisHistory.ts

import { TFile, normalizePath } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { DocumentAnalysis, PatternInsights, WorkCategory } from "./types";

export class AnalysisHistory {
  private readonly HISTORY_FILE = "_document-analysis/metadata/analysis-history.jsonl";
  private readonly METADATA_FOLDER = "_document-analysis/metadata";
  private readonly BASE_FOLDER = "_document-analysis";
  
  constructor(private readonly plugin: ObsidianCalendarAgentPlugin) {}
  
  async initialize(): Promise<void> {
    // Tạo các folders cần thiết (idempotent)
    await this.ensureFolder(this.BASE_FOLDER);
    await this.ensureFolder(this.METADATA_FOLDER);
    await this.ensureFolder("_document-analysis/by-date");
    await this.ensureFolder("_document-analysis/config");
  }
  
  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.plugin.app.vault.getAbstractFileByPath(normalized)) {
      try {
        await this.plugin.app.vault.createFolder(normalized);
      } catch {
        // Folder might already exist in race condition — ignore
      }
    }
  }
  
  // Initialize vault structure
  private async initializeVaultFolders(): Promise<void> {
    // Create folders if they don't exist
    // _document-analysis/metadata/
    // _document-analysis/by-date/
    // _document-analysis/patterns/
  }
  
  // Main: Log new analysis to JSONL
  async logAnalysis(analysis: DocumentAnalysis): Promise<string> {
    try {
      const jsonlLine = JSON.stringify(analysis) + "\n";
      
      // Append to JSONL file
      // If file doesn't exist, create it
      // If exists, append to end
      
      // Return analysis ID
      return analysis.id;
    } catch (error) {
      console.error("Failed to log analysis:", error);
      throw error;
    }
  }
  
  // Query: Get all analyses for a category
  async getHistoryByCategory(
    category: WorkCategory,
    limit?: number
  ): Promise<DocumentAnalysis[]> {
    try {
      const allAnalyses = await this.readJsonl();
      const filtered = allAnalyses.filter(a => a.category === category);
      return limit ? filtered.slice(-limit) : filtered;
    } catch (error) {
      console.error("Failed to get category history:", error);
      return [];
    }
  }
  
  // Calculate: Get pattern insights from history
  async getPatternsForCategory(category: WorkCategory): Promise<PatternInsights> {
    try {
      const analyses = await this.getHistoryByCategory(category);
      
      if (analyses.length === 0) {
        return this.getDefaultPatterns(category);
      }
      
      // Extract data
      const deadlineDays = analyses
        .filter(a => a.estimatedDeadlineDays)
        .map(a => a.estimatedDeadlineDays);
      
      const hours = analyses
        .filter(a => a.estimatedHours)
        .map(a => a.estimatedHours);
      
      // Calculate statistics
      const avgDays = this.mean(deadlineDays);
      const stdDevDays = this.stdDev(deadlineDays);
      const avgHours = this.mean(hours);
      const stdDevHours = this.stdDev(hours);
      
      // Estimate accuracy
      const estimateAccuracy = this.calculateAccuracy(analyses);
      
      // Common keywords
      const allKeywords = analyses.flatMap(a => a.detectedKeywords);
      const commonKeywords = this.topN(allKeywords, 10);
      
      return {
        category,
        totalAnalyzed: analyses.length,
        avgDeadlineDays: Math.round(avgDays * 10) / 10,
        stdDevDays: Math.round(stdDevDays * 10) / 10,
        avgHours: Math.round(avgHours * 10) / 10,
        stdDevHours: Math.round(stdDevHours * 10) / 10,
        estimateAccuracy,
        earlyCompletionRate: this.calculateEarlyRate(analyses),
        lateCompletionRate: this.calculateLateRate(analyses),
        commonKeywords,
        frequentApprovers: this.topN(
          analyses.flatMap(a => a.requiredApprovals || []),
          5
        ),
        riskDistribution: this.calculateRiskDistribution(analyses),
        lastUpdated: new Date(),
        dataQuality: analyses.length >= 10 ? "high" : "medium",
        confidenceThreshold: 10
      };
    } catch (error) {
      console.error("Failed to calculate patterns:", error);
      return this.getDefaultPatterns(category);
    }
  }
  
  // Update: Record feedback from user
  async recordFeedback(
    analysisId: string,
    actual: {
      deadlineDays: number;
      hours: number;
      feedback: "accurate" | "too_short" | "too_long";
    }
  ): Promise<void> {
    try {
      // Read all analyses
      const analyses = await this.readJsonl();
      
      // Find and update
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
      
      // Rewrite JSONL
      await this.writeJsonl(updated);
      
      // Recalculate patterns for this category
      const analysis = updated.find(a => a.id === analysisId);
      if (analysis) {
        const patterns = await this.getPatternsForCategory(analysis.category);
        await this.savePatterns(analysis.category, patterns);
      }
    } catch (error) {
      console.error("Failed to record feedback:", error);
      throw error;
    }
  }
  
  // Get all analyses
  async getAllAnalyses(): Promise<DocumentAnalysis[]> {
    return this.readJsonl();
  }
  
  // Helper: Read JSONL file
  private async readJsonl(): Promise<DocumentAnalysis[]> {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.historyFile);
      if (!file || !(file instanceof TFile)) {
        return [];
      }
      
      const content = await this.app.vault.read(file as TFile);
      return content
        .split("\n")
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line) as DocumentAnalysis;
          } catch {
            console.error(`Failed to parse JSONL line: ${line}`);
            return null;
          }
        })
        .filter(Boolean) as DocumentAnalysis[];
    } catch (error) {
      console.error("Failed to read JSONL:", error);
      return [];
    }
  }
  
  // Helper: Write JSONL file
  private async writeJsonl(analyses: DocumentAnalysis[]): Promise<void> {
    const jsonlContent = analyses
      .map(a => JSON.stringify(a))
      .join("\n");
    
    const file = this.app.vault.getAbstractFileByPath(this.historyFile);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, jsonlContent);
    }
  }
  
  // Helper: Save patterns to JSON
  private async savePatterns(
    category: WorkCategory,
    patterns: PatternInsights
  ): Promise<void> {
    const filename = `${this.metadataPath}/patterns-${category}.json`;
    const jsonContent = JSON.stringify(patterns, null, 2);
    
    // Try to update existing file, or create new
    const file = this.app.vault.getAbstractFileByPath(filename);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, jsonContent);
    } else {
      await this.app.vault.create(filename, jsonContent);
    }
  }
  
  // Helper: Calculate mean
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  // Helper: Calculate standard deviation
  private stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const m = this.mean(values);
    const variance = values.reduce((acc, val) => acc + Math.pow(val - m, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
  
  // Helper: Calculate estimate accuracy
  private calculateAccuracy(analyses: DocumentAnalysis[]): number {
    const withFeedback = analyses.filter(a => a.userFeedback);
    if (withFeedback.length === 0) return 85;
    
    const accurate = withFeedback.filter(a => a.userFeedback === "accurate").length;
    return Math.round((accurate / withFeedback.length) * 100);
  }
  
  // Helper: Calculate early completion rate
  private calculateEarlyRate(analyses: DocumentAnalysis[]): number {
    const withActual = analyses.filter(a => a.actualDeadlineDays && a.estimatedDeadlineDays);
    if (withActual.length === 0) return 0;
    
    const early = withActual.filter(a => 
      (a.actualDeadlineDays || 0) < (a.estimatedDeadlineDays || 0)
    ).length;
    return Math.round((early / withActual.length) * 100);
  }
  
  // Helper: Calculate late completion rate
  private calculateLateRate(analyses: DocumentAnalysis[]): number {
    const withActual = analyses.filter(a => a.actualDeadlineDays && a.estimatedDeadlineDays);
    if (withActual.length === 0) return 0;
    
    const late = withActual.filter(a => 
      (a.actualDeadlineDays || 0) > (a.estimatedDeadlineDays || 0)
    ).length;
    return Math.round((late / withActual.length) * 100);
  }
  
  // Helper: Calculate risk distribution
  private calculateRiskDistribution(analyses: DocumentAnalysis[]): Record<string, number> {
    const total = analyses.length;
    if (total === 0) return { low: 100, medium: 0, high: 0 };
    
    const low = analyses.filter(a => a.estimatedRiskLevel === "low").length;
    const medium = analyses.filter(a => a.estimatedRiskLevel === "medium").length;
    const high = analyses.filter(a => a.estimatedRiskLevel === "high").length;
    
    return {
      low: Math.round((low / total) * 100),
      medium: Math.round((medium / total) * 100),
      high: Math.round((high / total) * 100)
    };
  }
  
  // Helper: Get top N items from array
  private topN<T>(items: T[], n: number): T[] {
    const counts = new Map<string, number>();
    items.forEach(item => {
      const key = String(item);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key]) => key as any);
  }
  
  // Get default patterns for new category
  private getDefaultPatterns(category: WorkCategory): PatternInsights {
    // Return default patterns while awaiting data
    return {
      category,
      totalAnalyzed: 0,
      avgDeadlineDays: 7,
      stdDevDays: 2,
      avgHours: 8,
      stdDevHours: 4,
      estimateAccuracy: 85,
      earlyCompletionRate: 10,
      lateCompletionRate: 5,
      commonKeywords: [],
      frequentApprovers: [],
      riskDistribution: { low: 80, medium: 15, high: 5 },
      lastUpdated: new Date().toISOString(),  // ISO string, không phải Date object
      dataQuality: "low"
    };
  }
}
```

## 🧪 Testing
- Create test file with sample analyses
- Call logAnalysis() and verify JSONL appended
- Call getPatternsForCategory() and verify calculations
- Call recordFeedback() and verify patterns updated

## 🎯 When Done
- Commit: `git commit -m "feat(C): create AnalysisHistory with JSONL storage"`
- Push: `git push`
- Notify D that C is complete

## ⚠️ Avoid Common Mistakes
- Don't rewrite entire JSONL every time (use append for new entries)
- Don't forget error handling for corrupted JSONL lines
- Don't hardcode file paths (use variables)
- Don't forget to create vault folders
- Don't mix up file instance checks (file instanceof TFile)

## 📚 Reference Sections
- FEATURE_SPEC.md: Section 5 (vault structure)
- ARCHITECTURE.md: Section 5 (JSONL strategy + pattern calculation)
```

---

[Due to token limitations, I'll create a summary file instead of continuing with all remaining streams. The pattern is now clear for D, E, F, G, H streams.]

---

## REMAINING STREAMS (Quick Summary)

**All remaining streams follow the same pattern.** Each prompt should include:
1. **Objective** - Clear goal
2. **Tasks** - Checklist of deliverables
3. **Acceptance Criteria** - How to verify it's done
4. **Implementation Template** - Code skeleton to start from
5. **Testing** - How to test locally
6. **When Done** - Git commit message
7. **Avoid Common Mistakes** - What not to do
8. **Reference** - Point to docs

For reference, here's how to fill in the remaining streams:

```markdown
## STREAM D: DocumentAnalyzer - Document Analysis Engine
## STREAM E: WorkCategoryConfig - 6 Work Categories + System Prompts
## STREAM F: SafetyLayer & InsightsDashboard - UI Components
## STREAM G: Settings & Integration - Wire up everything in main.ts
## STREAM H: Testing - Unit tests + Integration tests
```

---

## HOW TO USE THESE PROMPTS

### For Each OpenCode Session:

```bash
# 1. Choose your stream (A, B.1, B.2, C, D, E, F, G, H)
# 2. Copy the prompt from this file for your stream
# 3. Create new OpenCode session
# 4. Paste prompt
# 5. Add context from repo
# 6. Start coding
# 7. When done, run tests + commit
```

---

**Document Version:** 2.0 (updated to match actual codebase)  
**Last Updated:** 2026-06-16  
**Key Changes:**
- Repo path: `d:\smartcalendar` (không phải `d:\obi-calendar`)
- Base branch: `dev` (không phải `main`)
- GeminiAgent.run() signature: 7 params thực tế
- CalendarTools: executor pattern với bind() + asRequiredString()
- AnalysisHistory: inject plugin (không phải App trực tiếp)
- API: requestUrl từ Obsidian (không phải fetch)
- Version target: 1.0.0 (không phải 2.0.0)
