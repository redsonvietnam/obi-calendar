# Specification: Obsidian Calendar Agent

**Status**: SDD Phase 1 - Specification Definition  
**Date**: 2026-06-20  
**Version**: 1.0

---

## 1. Vision & Intent

Build an intelligent AI calendar assistant deeply integrated into Obsidian that helps users manage their time, tasks, and calendar without context-switching. The agent understands user intent through natural language, synchronizes with Google Calendar & Tasks, and provides actionable insights based on vault context and work patterns.

**Core Purpose**: Reduce cognitive load by automating schedule management while keeping users in their note-taking environment.

---

## 2. Functional Requirements

### 2.1 Core Capabilities

#### User Interaction
- **Chat Interface**: Natural language conversation with AI in sidebar
- **Quick Actions**: Predefined prompts (Today's schedule, Next 5 events, This week)
- **Calendar Views**: Month, week, day views with navigation
- **Drag & Drop**: Reschedule events directly in calendar UI
- **File Attachments**: Analyze images/documents as part of chat

#### Calendar Management
- **List events** from Google Calendar with filters (date range, calendar, keywords)
- **Create events** with automatic conflict detection
- **Update events** (reschedule, change details, update attendees)
- **Delete events** with confirmation
- **Sync status**: Visual indicator of last sync time

#### Tasks Management
- **List task lists** from Google Tasks
- **Create/manage tasks** with due dates and descriptions
- **Complete tasks** and mark status
- **Organize** tasks into multiple lists

#### Vault Intelligence
- **Inbox Processing**: Auto-detect notes in inbox folder
- **Context Snapshot**: Extract daily notes, open tasks, projects for AI context
- **Deep Linking**: Link created events/tasks back to source notes
- **Note Analysis**: Extract events/tasks from messy note content
- **Note Writing**: Update vault notes with sync results

#### AI Agent
- **Function Calling**: Structured tool invocation for calendar/task operations
- **Pattern Learning**: Track estimate accuracy over time (work categories)
- **Insight Generation**: Identify work patterns, time allocations, risky deadlines
- **Smart Scheduling**: Suggest optimal time slots based on free time

### 2.2 Non-Functional Requirements

#### Safety & Confirmation
- Confirm destructive operations (delete, major updates)
- Undo last mutation capability
- Dry-run for complex operations

#### Performance
- Calendar sync < 2 seconds
- Chat response < 10 seconds (with tool calls)
- Drag & drop responsive (< 100ms)

#### Reliability
- Automatic token refresh for OAuth
- Graceful error handling with user notifications
- Retry logic for network failures

#### User Experience
- Dark/light theme auto-adaptation
- Responsive sidebar layout
- Clear status messages (loading, error, success)
- No context-switching required

---

## 3. Scope Definition

### In Scope (v1.0)
✅ OAuth 2.0 authentication with Google  
✅ Google Calendar full CRUD operations  
✅ Google Tasks full CRUD operations  
✅ Gemini AI function calling (20+ tools)  
✅ Month/week/day calendar views  
✅ Chat interface with message history  
✅ Vault context integration  
✅ Safety layer (confirm/undo)  
✅ Auto-sync service  
✅ Document analysis with AI  
✅ Work pattern tracking  

### Out of Scope (v2.0+)
❌ Multi-calendar color mapping  
❌ Streaming token-by-token responses  
❌ Rich markdown rendering in chat  
❌ Inline approve/deny modals  
❌ Calendar sharing/collaboration  
❌ Mobile app  
❌ Third-party integrations (Slack, Teams)  

---

## 4. User Scenarios

### Scenario 1: Schedule a Meeting
**User**: "Schedule a meeting with the team next Friday at 2 PM"

1. Agent parses request (date, time, attendees)
2. Checks for conflicts via list_events
3. Creates event with attendees
4. Returns confirmation with link

### Scenario 2: Process Inbox Note
**User**: Drops messy note in Inbox folder

1. Plugin auto-detects new file
2. User clicks "Process this note"
3. Agent analyzes content with AI
4. Extracts events/tasks/deadlines
5. Creates in Google Calendar/Tasks
6. Updates vault note with results

### Scenario 3: Rescheduling via Drag & Drop
**User**: Drags event on calendar view

1. UI captures drag coordinates
2. Calculates new time slot
3. Agent patches event
4. Calendar reloads with new time
5. Undo available if mistaken

### Scenario 4: Ask for Insights
**User**: "Show me my work patterns this month"

1. Agent queries analysis history
2. Calculates estimates vs actual
3. Shows by-category breakdown
4. Identifies high-risk deadlines
5. Suggests optimization

---

## 5. User Personas

### Persona 1: Knowledge Worker
- Uses Obsidian for notes + planning
- Manages multiple projects + meetings
- Needs quick scheduling without context-switching
- Wants AI to understand vault context

### Persona 2: Project Manager
- Tracks team deadlines + deliverables
- Analyzes time allocation patterns
- Needs insights into work distribution
- Uses Google Calendar as source of truth

### Persona 3: Creative Professional
- Has flexible schedule with blocks
- Uses Obsidian as creative workspace
- Wants to protect deep work time
- Needs AI to suggest optimal slots

---

## 6. Success Metrics

- **Adoption**: 80%+ of plugin users activate chat interface
- **Engagement**: Average 5+ chat messages per user per day
- **Accuracy**: 90%+ of AI scheduling decisions accepted without modification
- **Efficiency**: 50% reduction in time spent on calendar management
- **Pattern Insights**: Users generate 3+ actionable insights per week

---

## 7. Constraints & Assumptions

### Technical Constraints
- Obsidian Plugin API limitations (no WebSocket)
- Google API rate limits (1000 req/min for calendar)
- Browser local storage limited to ~5MB
- TypeScript target: ES6 compatible

### Business Constraints
- Gemini API key required (free tier with limits)
- Google OAuth setup manual (no auto-provisioning)
- Data stored locally in Obsidian (no cloud sync)

### Assumptions
- Users have Obsidian vault structure in place
- Users familiar with Google Calendar/Tasks
- Users comfortable with AI-assisted scheduling
- Network connectivity available (sync requires internet)

---

## 8. Glossary

| Term | Definition |
|------|-----------|
| **Tool** | Executable function Gemini can invoke (e.g., create_event) |
| **Function Calling** | Process of Gemini determining which tools to use for a request |
| **Vault Context** | Snapshot of daily notes, tasks, projects extracted from Obsidian vault |
| **Deep Link** | URL/reference linking Obsidian note to Google Calendar event/task |
| **Mutation** | Write operation (create/update/delete) requiring confirmation |
| **Undo Stack** | History of last mutation for rollback capability |
| **Pattern Learning** | Tracking estimate accuracy for work categories |

---

## 9. Open Questions

1. **Multi-workspace**: How to handle users with multiple Obsidian vaults?
2. **Conflict Resolution**: When AI proposes time but user has manual conflict?
3. **Privacy**: How to secure Google tokens (encryption in local storage)?
4. **Rate Limiting**: How to gracefully handle Google API quota exceeded?
5. **Streaming**: Should chat responses stream token-by-token or batch?

---

## 10. Success Criteria Checklist

- [ ] All 20+ tools working correctly with error handling
- [ ] Chat interface responsive and accessible
- [ ] Calendar sync reliable and fast (< 2s)
- [ ] OAuth flow smooth with clear user guidance
- [ ] Vault context extraction complete and accurate
- [ ] Pattern insights generating meaningful data
- [ ] Documentation complete with examples
- [ ] No critical bugs in production

