# Tasks: Obsidian Calendar Agent Implementation

**Status**: SDD Phase 3 - Implementation Tasks  
**Date**: 2026-06-20  
**Version**: 1.0

---

## Phase 1: Architecture Refactoring (High Priority)

### Task 1.1: Split CalendarView.ts into Components
**Complexity**: HIGH | **Priority**: P0 | **Estimated**: 8h

**Current State**: 2404 lines - monolithic

**Deliverables**:
- [ ] ChatPanel.ts (400-500 lines) - chat UI, messages, composer
- [ ] CalendarPanel.ts (600-700 lines) - month/week/day views
- [ ] TasksPanel.ts (300-400 lines) - task list management
- [ ] CalendarView.ts (refactored) - tab management + orchestration
- [ ] DragManager.ts (200 lines) - drag & drop logic
- [ ] MessageRenderer.ts (100 lines) - render chat bubbles

**Acceptance Criteria**:
- ✅ All views render correctly
- ✅ Tab switching works smoothly
- ✅ No performance regression
- ✅ Unit tests for each component

**Dependencies**: None (refactor only)

---

### Task 1.2: Create Type Safety Audit
**Complexity**: MEDIUM | **Priority**: P0 | **Estimated**: 4h

**Deliverables**:
- [ ] Review all `any` types - 53 found
- [ ] Replace with proper interfaces
- [ ] Create shared types file for DTOs
- [ ] Add strict tsconfig rules

**Files to review**:
- CalendarView.ts (many `any` for task objects)
- GoogleTasksAPI.ts
- CalendarTools.ts
- SyncManager.ts

**Acceptance Criteria**:
- ✅ No `any` types except for Obsidian/external APIs
- ✅ All DTOs in types.ts
- ✅ TypeScript --strict passes

---

### Task 1.3: Extract Tool Definitions into Separate Files
**Complexity**: MEDIUM | **Priority**: P1 | **Estimated**: 6h

**Current State**: CalendarTools.ts = 906 lines with 20+ tools mixed

**Deliverables**:
- [ ] calendarTools/ folder with:
  - [ ] calendar.ts (list_events, create_event, update_event, delete_event)
  - [ ] tasks.ts (list_tasks, create_task, update_task, patch_task, etc.)
  - [ ] vault.ts (get_vault_context, write_vault_note, append_vault_note)
  - [ ] analysis.ts (analyze_work_document, get_pattern_insights, record_feedback)
  - [ ] index.ts (re-export all tools)
- [ ] Each tool file < 300 lines
- [ ] Tool registry in CalendarTools.ts imports from above

**Acceptance Criteria**:
- ✅ Tools organized by domain
- ✅ Each tool file independent
- ✅ Tool registry works same as before
- ✅ No circular dependencies

---

## Phase 2: Testing & Quality Assurance (High Priority)

### Task 2.1: Setup Test Framework
**Complexity**: MEDIUM | **Priority**: P1 | **Estimated**: 4h

**Deliverables**:
- [ ] Add Jest to package.json
- [ ] Create jest.config.js
- [ ] Setup __tests__ folder structure
- [ ] Example test files for each component

**Files to configure**:
- jest.config.js
- tsconfig.test.json
- .jestignore
- package.json scripts: `npm test`, `npm test:watch`

**Acceptance Criteria**:
- ✅ `npm test` runs without errors
- ✅ Coverage reporting enabled
- ✅ Example tests pass

---

### Task 2.2: Write Unit Tests for Core Tools
**Complexity**: HIGH | **Priority**: P1 | **Estimated**: 12h

**Coverage Target**: 80% for:
- [ ] GoogleCalendarAPI (create, update, delete, list)
- [ ] GoogleTasksAPI (all CRUD operations)
- [ ] OAuthManager (token refresh, exchange)
- [ ] SafetyLayer (confirm, undo)
- [ ] VaultContext (snapshot building)

**Each Tool File Needs**:
- ✅ Happy path tests
- ✅ Error handling tests
- ✅ Edge case tests
- ✅ Mocked API responses

**Acceptance Criteria**:
- ✅ 80%+ code coverage
- ✅ All critical paths tested
- ✅ Tests pass in CI

---

### Task 2.3: Integration Tests for Agent Loop
**Complexity**: HIGH | **Priority**: P2 | **Estimated**: 10h

**Test Scenarios**:
- [ ] User message → Gemini → tool call → result → response
- [ ] Multi-round function calling (max 6 rounds)
- [ ] Error handling in tool execution
- [ ] Vault context integration
- [ ] Tool combination scenarios

**Mock Strategy**:
- Mock Gemini API responses
- Mock Google Calendar/Tasks APIs
- Real Obsidian vault for testing

**Acceptance Criteria**:
- ✅ All scenarios pass
- ✅ Agent behaves predictably
- ✅ Error cases handled

---

## Phase 3: Feature Completion (Medium Priority)

### Task 3.1: Implement Token Encryption
**Complexity**: MEDIUM | **Priority**: P2 | **Estimated**: 6h

**Current State**: Tokens stored plaintext in localStorage

**Deliverables**:
- [ ] Add crypto library (tweetnacl.js or libsodium.js)
- [ ] Encrypt tokens before storage
- [ ] Decrypt tokens on load
- [ ] Test encryption/decryption

**Acceptance Criteria**:
- ✅ Tokens encrypted at rest
- ✅ Performance < 50ms per operation
- ✅ No plaintext tokens in storage

---

### Task 3.2: Improve Error Messages & Logging
**Complexity**: LOW | **Priority**: P1 | **Estimated**: 4h

**Current Issues**:
- Generic error messages
- No structured logging
- Hard to debug failures

**Deliverables**:
- [ ] Create Logger utility class
- [ ] Add structured logging (timestamp, level, context)
- [ ] User-friendly error messages
- [ ] Debug panel (show logs if needed)

**Acceptance Criteria**:
- ✅ All errors logged with context
- ✅ User messages are helpful
- ✅ Debugging easier with logs

---

### Task 3.3: Add Retry Logic & Backoff
**Complexity**: MEDIUM | **Priority**: P2 | **Estimated**: 5h

**Scenarios**:
- [ ] Network timeouts → retry 3x with exponential backoff
- [ ] Rate limit (429) → wait 60s, retry
- [ ] Server errors (5xx) → retry with backoff

**Deliverables**:
- [ ] Retry utility with exponential backoff
- [ ] Max retry limits
- [ ] User notification for retries
- [ ] Tests for retry logic

**Acceptance Criteria**:
- ✅ Transient errors handled gracefully
- ✅ User notified of retries
- ✅ No infinite loops

---

## Phase 4: Documentation & Examples (Medium Priority)

### Task 4.1: Write API Documentation
**Complexity**: MEDIUM | **Priority**: P2 | **Estimated**: 6h

**Deliverables**:
- [ ] GoogleCalendarAPI.md - all methods with examples
- [ ] GoogleTasksAPI.md - all methods with examples
- [ ] CalendarTools.md - all 20+ tools documented
- [ ] GeminiAgent.md - function calling loop explained
- [ ] OAuthManager.md - OAuth flow documented

**Each File Includes**:
- Method signature
- Parameters + types
- Return value
- Error handling
- Usage example

**Acceptance Criteria**:
- ✅ All methods documented
- ✅ Examples runnable
- ✅ Easy to understand

---

### Task 4.2: Create Developer Guide
**Complexity**: MEDIUM | **Priority**: P3 | **Estimated**: 4h

**Deliverables**:
- [ ] ARCHITECTURE.md - system design overview
- [ ] DEVELOPMENT.md - setup, build, test instructions
- [ ] CONTRIBUTING.md - guidelines for contributors
- [ ] DEBUGGING.md - common issues + solutions

**Acceptance Criteria**:
- ✅ New developer can setup in < 15 min
- ✅ Architecture clearly explained
- ✅ Debugging steps documented

---

## Phase 5: UI/UX Polish (Medium Priority)

### Task 5.1: Improve Chat UX
**Complexity**: MEDIUM | **Priority**: P2 | **Estimated**: 8h

**Current Issues**:
- No message loading indicator
- No typing indicator
- No "stop" button feedback
- No error recovery

**Deliverables**:
- [ ] Typing indicator animation
- [ ] Loading skeleton for chat
- [ ] Visual stop button state
- [ ] Error recovery options
- [ ] Improved accessibility (ARIA labels)

**Acceptance Criteria**:
- ✅ Chat feels responsive
- ✅ Status always clear to user
- ✅ Keyboard navigation works
- ✅ Screen reader compatible

---

### Task 5.2: Calendar View Improvements
**Complexity**: MEDIUM | **Priority**: P2 | **Estimated**: 6h

**Deliverables**:
- [ ] Highlight current day
- [ ] Show week numbers
- [ ] Configurable week start (Mon/Sun)
- [ ] Event preview on hover
- [ ] Color coding for event types

**Acceptance Criteria**:
- ✅ Calendar more usable
- ✅ Events easier to identify
- ✅ No performance issues

---

## Phase 6: Performance & Optimization (Low Priority)

### Task 6.1: Profile & Optimize
**Complexity**: MEDIUM | **Priority**: P3 | **Estimated**: 8h

**Metrics to Track**:
- [ ] Chat response time
- [ ] Calendar render time
- [ ] Memory usage
- [ ] Bundle size

**Optimizations**:
- [ ] Lazy load calendar views
- [ ] Memoize expensive computations
- [ ] Optimize DOM updates
- [ ] Reduce bundle size

**Acceptance Criteria**:
- ✅ Chat < 10s with tools
- ✅ Calendar render < 500ms
- ✅ Memory < 50MB
- ✅ Bundle < 500KB gzipped

---

## Phase 7: Production Readiness (Medium Priority)

### Task 7.1: CI/CD Pipeline
**Complexity**: MEDIUM | **Priority**: P2 | **Estimated**: 6h

**Deliverables**:
- [ ] GitHub Actions workflow
- [ ] Lint on push
- [ ] Run tests on push
- [ ] Build verification
- [ ] Automated releases

**Files to create**:
- .github/workflows/lint-test.yml
- .github/workflows/release.yml

**Acceptance Criteria**:
- ✅ PR checks pass/fail clearly
- ✅ Tests run automatically
- ✅ Releases automated

---

### Task 7.2: Migration Guide for Existing Users
**Complexity**: LOW | **Priority**: P2 | **Estimated**: 3h

**Deliverables**:
- [ ] MIGRATION.md - breaking changes
- [ ] Version-specific guides
- [ ] Data migration steps (if needed)
- [ ] Rollback instructions

**Acceptance Criteria**:
- ✅ Users can upgrade safely
- ✅ No data loss
- ✅ Clear support path

---

## Timeline Summary

| Phase | Tasks | Estimated | Priority |
|-------|-------|-----------|----------|
| Phase 1 | Refactoring (3 tasks) | 18h | P0 |
| Phase 2 | Testing (3 tasks) | 26h | P1 |
| Phase 3 | Features (3 tasks) | 15h | P2 |
| Phase 4 | Documentation (2 tasks) | 10h | P2 |
| Phase 5 | UI/UX (2 tasks) | 14h | P2 |
| Phase 6 | Optimization (1 task) | 8h | P3 |
| Phase 7 | Production (2 tasks) | 9h | P2 |
| **TOTAL** | **16 tasks** | **~100h** | - |

**Recommended Path**:
1. Phase 1 (Refactoring) - **18h**
2. Phase 2 (Testing) - **26h**
3. Phase 3 (Features) - **15h**
4. Phase 4 + 5 (Docs + UX) - **24h**
5. Phase 6 + 7 (Performance + CI/CD) - **17h**

**Total: ~100 hours of focused work**

