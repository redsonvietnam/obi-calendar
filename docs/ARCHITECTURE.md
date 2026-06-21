# Architecture

## System Overview

```
┌─────────────────────────────────────────────────┐
│                  Obsidian Plugin                 │
├─────────────────────────────────────────────────┤
│  CalendarView (Orchestrator)                     │
│  ┌───────────┬───────────┬───────────┐          │
│  │ ChatPanel │CalendarPanel│TasksPanel│          │
│  └─────┬─────┴─────┬─────┴─────┬─────┘          │
│        │           │           │                 │
│  ┌─────▼─────┐ ┌───▼───┐ ┌────▼─────┐          │
│  │GeminiAgent│ │DragMgr│ │MessageRnd│          │
│  └─────┬─────┘ └───────┘ └──────────┘          │
│        │                                        │
│  ┌─────▼──────────────────────────┐             │
│  │        CalendarTools           │             │
│  │  (Tool Registry - 20+ tools)  │             │
│  └─────┬────────────┬─────────────┘             │
│        │            │                           │
│  ┌─────▼─────┐ ┌────▼──────┐                   │
│  │CalendarAPI│ │TasksAPI   │                   │
│  └─────┬─────┘ └────┬──────┘                   │
│        │            │                           │
│  ┌─────▼────────────▼──────┐                   │
│  │      OAuthManager       │                   │
│  │  (PKCE + Token Refresh) │                   │
│  └─────────────────────────┘                   │
├─────────────────────────────────────────────────┤
│  SafetyLayer │ VaultContext │ Logger │ RetryUtils│
└─────────────────────────────────────────────────┘
```

## Key Components

### CalendarView (Orchestrator)
- Tab switching (Chat/Calendar/Tasks)
- Initializes all panels
- Message passing between components

### ChatPanel
- Chat UI rendering
- Message input and submission
- File attachment handling

### CalendarPanel
- Month/Week/Day/Timeline views
- Event display and interaction
- Navigation and date management

### TasksPanel
- Google Tasks CRUD UI
- Task list management
- Status updates

### GeminiAgent
- Gemini AI function calling loop
- Model fallback chain
- Conversation history management

### CalendarTools
- Tool registry for 20+ tools
- Calendar operations (list/create/update/delete events)
- Tasks operations (list/create/update/delete tasks)
- Vault operations (read/write/append notes)
- Safety confirmations

### OAuthManager
- OAuth 2.0 PKCE flow
- Token storage (encrypted)
- Automatic token refresh

### SafetyLayer
- Confirmation dialogs before destructive operations
- Undo buffer (20 entries max)

### VaultContext
- Daily notes, tasks, projects scanning
- Snapshot building for AI context

## Data Flow

1. User types message → ChatPanel
2. ChatPanel → GeminiAgent.run()
3. GeminiAgent → Gemini API (with tools)
4. If function call → CalendarTools.executeTool()
5. CalendarTools → GoogleCalendarAPI/GoogleTasksAPI
6. Result → GeminiAgent → ChatPanel → User

## Error Handling

- **Network errors**: RetryUtils with exponential backoff
- **API errors**: Parsed into structured GoogleCalendarApiError
- **Auth errors**: OAuthManager refreshes token automatically
- **User errors**: SafetyLayer confirms before destructive ops
- **Logging**: Logger utility for all console output
