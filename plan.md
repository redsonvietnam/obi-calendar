# Technical Plan: Obsidian Calendar Agent

**Status**: SDD Phase 2 - Technical Planning  
**Date**: 2026-06-20  
**Version**: 1.0

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Obsidian Sidebar UI                       │
│  ┌──────────────┬──────────────┬──────────────────────────┐  │
│  │   Chat Tab   │ Calendar Tab  │     Tasks Tab            │  │
│  └──────────────┴──────────────┴──────────────────────────┘  │
│              ▲                                                │
│              │ User Input (text/image)                       │
└──────────────┼────────────────────────────────────────────────┘
               │
        ┌──────▼──────────┐
        │ GeminiAgent     │ ◄─── AI Loop (max 6 rounds)
        │ Function Calling│
        └──────┬──────────┘
               │
        ┌──────▼──────────────────────┐
        │   CalendarTools Registry    │
        │  (20+ tool executors)       │
        └──────┬──────────────────────┘
               │
        ┌──────▼────────────────────────────────────────┐
        │                                               │
    ┌───▼────┐  ┌────────────┐  ┌────────────┐        │
    │Calendar│  │  Tasks     │  │ Vault      │        │
    │ API    │  │  API       │  │ Context    │        │
    └────┬───┘  └────┬───────┘  └────┬───────┘        │
         │           │               │                 │
    ┌────▼───────────▼───────────────▼────────────┐   │
    │   Google Cloud APIs                         │   │
    │   - Google Calendar REST API                │   │
    │   - Google Tasks REST API                   │   │
    └─────────────────────────────────────────────┘   │
                                                       │
    ┌──────────────────────────────────────────────┐  │
    │   Obsidian Vault                            │  │
    │   - Daily notes (context)                   │  │
    │   - Task lists (context)                    │  │
    │   - Project notes (context)                 │  │
    └──────────────────────────────────────────────┘  │
                                                       │
    ┌──────────────────────────────────────────────┐  │
    │   Local Storage (Obsidian Data Store)       │  │
    │   - OAuth tokens                            │  │
    │   - User settings                           │  │
    │   - Analysis history                        │  │
    │   - Undo stack                              │  │
    └──────────────────────────────────────────────┘  │
                                                       │
    └───────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Plugin API** | Obsidian 1.6.7+ | Only option for Obsidian integration |
| **Language** | TypeScript 5.5 | Type-safe, compiles to ES6 |
| **Bundler** | esbuild 0.23 | Fast, minimal config, native Obsidian support |
| **AI Model** | Gemini 2.5 Flash | Free tier, function calling support, fallback models |
| **Calendar API** | Google Calendar REST | Official Google API, standard OAuth 2.0 |
| **Tasks API** | Google Tasks REST | Official Google API, same OAuth flow |
| **Storage** | Obsidian localStorage + DataStore | No external storage, privacy-first |
| **HTTP Client** | Obsidian requestUrl API | Built-in, no axios/fetch dependencies |
| **UI Framework** | Native DOM | No React/Vue, minimal bundle size |

---

## 3. Core Components

### 3.1 Plugin Entry (main.ts)
- Initialize managers (OAuth, Calendar API, Tasks API, Gemini Agent)
- Register commands for manual operations
- Register sidebar view
- Setup event listeners for auto-processing
- Load/save settings

### 3.2 UI Layer (CalendarView.ts)

**Current State**: 2404 lines - NEEDS REFACTORING

**Issues**:
- Single monolithic file
- Mixed concerns (chat, calendar, tasks, rendering)
- Hard to test and maintain
- Complex state management

**Refactoring Plan**:
- Split into: ChatPanel, CalendarPanel, TasksPanel (separate files)
- Extract drag & drop logic to DragManager
- Extract calendar grid logic to CalendarGrid
- Create MessageRenderer for chat rendering
- Use simple state management (no framework)

### 3.3 AI Agent (GeminiAgent.ts)
- Manages Gemini API communication
- Function calling loop (max 6 rounds)
- Model fallback strategy
- Error handling + quota management

### 3.4 Tool Registry (CalendarTools.ts)

**20+ Tools Organized by Category**:

**Calendar Tools** (5)
- list_events
- create_event
- update_event
- delete_event
- patch_event

**Tasks Tools** (8)
- list_task_lists, create_task_list, delete_task_list
- list_tasks, create_task, update_task, patch_task, delete_task

**Vault Tools** (3)
- get_vault_context
- write_vault_note
- append_vault_note

**Analysis Tools** (4)
- analyze_work_document
- get_pattern_insights
- record_feedback
- get_work_categories

### 3.5 API Wrappers
- **GoogleCalendarAPI**: REST wrapper + error normalization
- **GoogleTasksAPI**: REST wrapper + error normalization
- Both use Obsidian's requestUrl for HTTP

### 3.6 OAuth Manager (OAuthManager.ts)
- Authorization code flow
- Token refresh (automatic)
- Token storage (local)
- Scope management

### 3.7 Safety Layer (SafetyLayer.ts)
- Confirmation modals for destructive ops
- Undo last mutation
- Transaction history
- Rollback support

### 3.8 Vault Context (VaultContext.ts)
- Extract daily notes (YYYY-MM-DD.md pattern)
- Extract open tasks (query vault for #task)
- Extract project notes (query vault for #project)
- Build JSON snapshot for AI context

### 3.9 Analysis & Insights
- **DocumentAnalyzer**: Parse work documents, extract deadlines
- **AnalysisHistory**: Store analysis records, track patterns
- **WorkCategoryConfig**: Predefined work categories (PH10, PC06, etc.)
- **InsightsDashboard**: Visualize patterns + estimates

### 3.10 Sync Manager (SyncManager.ts)
- Auto-sync service (configurable interval)
- Bi-directional sync (calendar, tasks)
- Conflict resolution
- Change detection

---

## 4. Data Flow

### Flow 1: User Chat → Calendar Event Creation

```
1. User: "Schedule meeting tomorrow 2 PM"
   ▼
2. CalendarView.sendMessage()
   ▼
3. GeminiAgent.run(userMessage, history, timezone, vaultSnapshot)
   ▼
4. Build system prompt + vault context
   ▼
5. Call Gemini API with tools
   ▼
6. Gemini: "I'll create an event. Let me check conflicts first"
   ▼
7. Function call: list_events({dateMin: tomorrow, dateMax: tomorrow+1})
   ▼
8. CalendarTools.execListEvents()
   ▼
9. GoogleCalendarAPI.listEvents() → REST call
   ▼
10. Return conflicts (if any) to Gemini
    ▼
11. Gemini: "No conflicts, creating event"
    ▼
12. Function call: create_event({summary, startTime, endTime, ...})
    ▼
13. CalendarTools.execCreateEvent()
    ▼
14. SafetyLayer.requestConfirmation() → User confirms
    ▼
15. GoogleCalendarAPI.createEvent() → REST call
    ▼
16. Return event ID to Gemini
    ▼
17. Gemini: "Event created! [link]"
    ▼
18. Display response in chat + reload calendar view
```

### Flow 2: Inbox Note Processing

```
1. User creates/moves note to Inbox/
   ▼
2. Plugin detects via vault.on('create') event
   ▼
3. Show notice: "New note in Inbox detected"
   ▼
4. User clicks "Process this note"
   ▼
5. Read file content
   ▼
6. Send to Gemini with image (if attached)
   ▼
7. Gemini analyzes + extracts events/tasks
   ▼
8. Create in Google Calendar/Tasks via tools
   ▼
9. Write_vault_note to update Obsidian with results
   ▼
10. Show summary in chat
```

---

## 5. Database Schema

### Settings (Obsidian Plugin Data)
```json
{
  "geminiApiKey": "string",
  "timezone": "string",
  "googleClientId": "string",
  "googleClientSecret": "string",
  "googleRedirectUri": "string",
  "autoOpenSidebarOnStart": "boolean",
  "requireSafetyConfirm": "boolean",
  "calendarRefreshInterval": "number",
  "sync": {
    "enabled": "boolean",
    "intervalMinutes": "number"
  }
}
```

### OAuth Tokens (Encrypted Local Storage)
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "tokenType": "Bearer",
  "expiresAt": "number"
}
```

### Undo Stack
```json
[
  {
    "timestamp": "ISO string",
    "operation": "create_event|update_event|delete_event",
    "resourceId": "string",
    "originalData": "object",
    "newData": "object"
  }
]
```

### Analysis History
```json
[
  {
    "id": "string",
    "timestamp": "ISO string",
    "category": "WorkCategory",
    "jobTitle": "string",
    "estimatedHours": "number",
    "actualHours": "number",
    "estimatedDeadlineDays": "number",
    "accuracy": "number"
  }
]
```

---

## 6. Error Handling Strategy

| Error Type | Handling |
|-----------|----------|
| Network (no internet) | Offline notification, queue operations |
| Google API rate limit (429) | Exponential backoff, notify user |
| Google API auth (401/403) | Redirect to OAuth refresh flow |
| Google API not found (404) | Calendar/event doesn't exist, skip |
| Gemini quota exceeded | Try next model in fallback chain |
| Gemini API error | Show error to user, don't repeat |
| Local storage full | Warn user, clear old analysis history |
| Invalid user input | Validate + show helpful error message |

---

## 7. Performance Targets

| Operation | Target | Acceptable |
|-----------|--------|-----------|
| Calendar list (30 days) | < 500ms | < 1s |
| Calendar sync | < 2s | < 5s |
| Chat response (with tools) | < 10s | < 20s |
| Drag & drop reschedule | < 100ms | < 500ms |
| Vault context snapshot | < 1s | < 2s |
| UI render (calendar grid) | < 200ms | < 500ms |

---

## 8. Security Considerations

1. **OAuth Tokens**:
   - Store encrypted in Obsidian DataStore
   - Auto-refresh before expiry
   - Clear on plugin unload

2. **API Keys**:
   - Gemini API key stored in settings (user-managed)
   - No hardcoded keys
   - Warn if key exposed in vault

3. **Local Data**:
   - No sensitive data in chat history
   - Settings stored in Obsidian
   - Analysis history anonymized

4. **Network**:
   - HTTPS only for all API calls
   - No credential leakage in logs
   - Validate API responses

---

## 9. Deployment Strategy

### Build Process
```bash
npm install          # Install deps
npm run dev          # Dev build (watch)
npm run build        # Production build
npm run build:deploy # Auto-copy to vault
```

### Distribution
- Community plugin (after v1.0 stabilization)
- Manual install (current dev method)
- GitHub releases with changelogs

### Versioning
- Semantic versioning (major.minor.patch)
- manifest.json synchronized with package.json
- Changelog.md for user-facing changes

