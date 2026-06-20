# Constitution: Obsidian Calendar Agent

**Status**: SDD Phase 0 - Project Constitution  
**Date**: 2026-06-20  
**Version**: 1.0

---

## 1. Core Principles

### 1.1 User-Centric Design
- **Principle**: Features exist to serve users, not the other way around
- **Application**: 
  - Every tool must have a clear user benefit
  - Simplify UX before adding features
  - Prioritize reliability over novelty
  - Test assumptions with real users

### 1.2 Privacy-First Architecture
- **Principle**: User data belongs to the user, not us
- **Application**:
  - No cloud storage (all data local in Obsidian)
  - No telemetry or tracking
  - Tokens encrypted at rest
  - User controls what data is shared
  - Clear consent for any external API calls

### 1.3 Spec-Driven Development (SDD)
- **Principle**: Define what to build before building it
- **Application**:
  - Spec → Plan → Tasks → Implement
  - Specifications drive code, not vice versa
  - Refine specs through clarification phases
  - Cross-artifact consistency validation
  - Specifications are living documents

### 1.4 Type Safety First
- **Principle**: Prevent bugs at compile time, not runtime
- **Application**:
  - TypeScript with --strict mode
  - No `any` types (except unavoidable Obsidian APIs)
  - Strong interfaces for all data
  - Exhaustive type checks
  - Test-driven type development

### 1.5 Modular & Maintainable Code
- **Principle**: Small, focused modules > monolithic files
- **Application**:
  - Single Responsibility Principle
  - Max 500 lines per file (target)
  - Clear dependencies between modules
  - No circular dependencies
  - Testable in isolation

### 1.6 Safety & Confirmation
- **Principle**: Destructive operations require user intent
- **Application**:
  - Confirm before delete/major update
  - Undo capability for mutations
  - Dry-run for complex operations
  - Clear error messages
  - Transaction rollback support

### 1.7 Reliability & Error Handling
- **Principle**: Expected to fail gracefully, not crash
- **Application**:
  - Try-catch on all external API calls
  - Exponential backoff for transient errors
  - Meaningful error messages to users
  - Structured logging for debugging
  - Graceful degradation under failure

### 1.8 Performance-Conscious
- **Principle**: Respect user's device and bandwidth
- **Application**:
  - Lazy load non-critical components
  - Cache API results intelligently
  - Optimize DOM updates
  - Target bundle < 500KB
  - Chat response < 10s with tools
  - Calendar render < 500ms

### 1.9 Documentation-Driven
- **Principle**: Code without docs is legacy code
- **Application**:
  - JSDoc comments for all public methods
  - Architecture documentation kept current
  - Example code for complex flows
  - Runbooks for common tasks
  - API reference for tool definitions

### 1.10 Community-Ready
- **Principle**: Build for extensibility from day one
- **Application**:
  - Tool registry easy to extend
  - Plugin architecture supports add-ons
  - Community extensions supported
  - Presets for different workflows
  - Clear contribution guidelines

---

## 2. Technical Constraints

### 2.1 Technology Choices (Locked)
- **Obsidian 1.6.7+** - Plugin runtime (no choice)
- **TypeScript 5.5+** - Source language (no JavaScript)
- **esbuild** - Bundler (no webpack/rollup)
- **Gemini API** - AI model (fallback chain required)
- **Google OAuth 2.0** - Authentication (industry standard)
- **Native DOM** - UI rendering (no React/Vue)

### 2.2 Architecture Patterns (Locked)
- **No external state** - Local-first storage only
- **No database** - Obsidian localStorage only
- **No server** - All logic runs in plugin
- **No background workers** - Single-threaded
- **No websockets** - REST API only (Obsidian limitation)

### 2.3 Platform Limitations
- **Browser storage** - ~5MB local limit
- **Google API rate limit** - 1000 req/min
- **Gemini quota** - 15 req/min free tier
- **Obsidian API** - Plugin sandbox constraints
- **Network** - Sync requires internet connectivity

---

## 3. Quality Standards

### 3.1 Code Quality
- ✅ TypeScript --strict mode passes
- ✅ ESLint rules pass (airbnb config)
- ✅ No console.errors in production
- ✅ No `any` types without justification
- ✅ Max 500 lines per file
- ✅ Max 5-level nesting depth
- ✅ JSDoc for all public APIs

### 3.2 Testing Standards
- ✅ 80%+ code coverage for critical paths
- ✅ Unit tests for all utils/helpers
- ✅ Integration tests for agent loop
- ✅ E2E tests for main workflows
- ✅ All tests pass before merge
- ✅ No test flakiness

### 3.3 Performance Standards
- ✅ Chat response < 10s (with tools)
- ✅ Calendar render < 500ms
- ✅ Calendar sync < 2s
- ✅ Drag & drop < 100ms
- ✅ Memory footprint < 50MB
- ✅ Bundle size < 500KB gzipped

### 3.4 Documentation Standards
- ✅ README complete + setup guide
- ✅ Architecture documented
- ✅ API reference for all tools
- ✅ Examples for common tasks
- ✅ CONTRIBUTING guide present
- ✅ Version changelog maintained

### 3.5 Security Standards
- ✅ OAuth tokens encrypted at rest
- ✅ No credentials in source code
- ✅ API key validation on startup
- ✅ HTTPS only for external calls
- ✅ Input validation on all endpoints
- ✅ No sensitive data in logs

### 3.6 UX Standards
- ✅ Keyboard navigation works
- ✅ Screen reader compatible (ARIA)
- ✅ Dark/light theme support
- ✅ Mobile responsive (where possible)
- ✅ Error messages are helpful
- ✅ Status always visible to user

---

## 4. Development Workflow

### 4.1 Feature Development Path
```
1. Spec (define what)
   ↓
2. Clarify (resolve ambiguities)
   ↓
3. Checklist (validate requirements)
   ↓
4. Plan (define how + tech stack)
   ↓
5. Tasks (break into actionable items)
   ↓
6. Analyze (cross-artifact validation)
   ↓
7. Implement (write code + tests)
   ↓
8. Review (code review + testing)
   ↓
9. Deploy (release + changelog)
```

### 4.2 Code Review Checklist
- [ ] Follows SDD spec + plan
- [ ] TypeScript passes with --strict
- [ ] Tests pass (80%+ coverage)
- [ ] No performance regressions
- [ ] Documentation updated
- [ ] Security audit passed
- [ ] Accessibility checked
- [ ] No console.errors

### 4.3 Definition of Done
- ✅ Code written + reviewed
- ✅ Tests green (unit + integration)
- ✅ Documentation updated
- ✅ Performance verified
- ✅ Security audit passed
- ✅ PR merged to main
- ✅ Changelog updated
- ✅ Released (if applicable)

---

## 5. Decision-Making Framework

### 5.1 Architecture Decisions
**Question**: Should we add feature X?  
**Framework**:
1. Is it in the spec?
2. Does it reduce user cognitive load?
3. Is implementation < 8 hours?
4. No performance impact?
5. Has clear undo/rollback?

**Go if**: 4+ YES answers

### 5.2 Technology Decisions
**Question**: Should we add dependency Y?  
**Framework**:
1. Is Obsidian API insufficient?
2. Will it reduce code by > 50 lines?
3. Is it actively maintained?
4. < 50KB gzipped?
5. Can we remove it later?

**Go if**: 4+ YES answers

### 5.3 Scope Decisions
**Question**: Should we prioritize task Z?  
**Framework**:
1. Blocks another critical task?
2. User-facing impact > 1000 users?
3. Risk mitigation (security/stability)?
4. Can be done in < 1 sprint?
5. Technical debt reduction?

**Go if**: 3+ YES answers (high priority)

---

## 6. Team Norms

### 6.1 Communication
- Decisions documented in ADR (Architecture Decision Records)
- Async-first communication
- Sync meetings only for complex discussions
- All decisions logged for future reference

### 6.2 Responsibility
- Feature owner: responsible for spec + implementation
- Code reviewer: responsible for quality standards
- Release owner: responsible for changelog + deployment
- No single points of failure

### 6.3 Escalation Path
1. **Blocker?** → Async discussion in issue
2. **Not resolved in 24h?** → Sync call
3. **Still unresolved?** → Architecture Decision Record
4. **Decision needed?** → Core team consensus

---

## 7. Success Definition

### 7.1 For Users
- ✅ Reduces time spent on calendar management
- ✅ Natural language interface feels natural
- ✅ Never loses data (undo always works)
- ✅ Respects privacy (data stays local)
- ✅ Integrates seamlessly with Obsidian

### 7.2 For Developers
- ✅ Codebase easy to understand
- ✅ Adding features is straightforward
- ✅ Onboarding new contributors < 1 day
- ✅ Tests provide confidence
- ✅ Documentation answers most questions

### 7.3 For the Project
- ✅ 1000+ active users
- ✅ 80%+ user satisfaction
- ✅ Zero critical security issues
- ✅ < 2% regression bugs
- ✅ Community contributions flowing

---

## 8. Anti-Patterns (What We Avoid)

### 8.1 Code Anti-Patterns
- ❌ Monolithic files > 500 lines
- ❌ Functions with 5+ levels of nesting
- ❌ Circular dependencies
- ❌ Magic numbers/strings (use constants)
- ❌ Copy-paste code (refactor to shared)
- ❌ No tests for critical logic
- ❌ Swallowing exceptions silently

### 8.2 Architecture Anti-Patterns
- ❌ Tight coupling between modules
- ❌ Mixed concerns (UI + logic)
- ❌ Global state without boundaries
- ❌ External dependencies in core logic
- ❌ Premature optimization
- ❌ Over-engineering simple problems

### 8.3 Process Anti-Patterns
- ❌ Coding before spec is clear
- ❌ Skipping code review
- ❌ Ignoring test failures
- ❌ Breaking main branch
- ❌ Releasing without changelog
- ❌ Feature creep mid-sprint

---

## 9. Values

### 9.1 Core Values
1. **User Privacy** - Your data is yours
2. **Simplicity** - Less code, more clarity
3. **Reliability** - Does what it says
4. **Openness** - Community-driven
5. **Excellence** - High standards, well-executed

### 9.2 Decision Tiebreaker
**When in doubt, choose the option that**:
- Improves user privacy
- Reduces code complexity
- Increases reliability
- Enables community contribution
- Maintains code excellence

---

## Appendix: Governance

### Amendment Process
- Proposal must be documented
- 2-week discussion period minimum
- Consensus or core team vote
- Changes logged with rationale

### Review Frequency
- Constitution review: Annually
- Technical constraints: As needed
- Quality standards: Per release
- Anti-patterns: Continuously updated

