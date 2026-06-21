# Development Guide

## Prerequisites

- Node.js 18+
- npm
- Obsidian (for testing)

## Setup

```bash
# Clone repository
git clone https://github.com/redsonvietnam/obi-calendar.git
cd obi-calendar

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Project Structure

```
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── types.ts             # Shared types and constants
│   ├── CalendarView.ts      # Main view orchestrator
│   ├── ChatPanel.ts         # Chat UI component
│   ├── CalendarPanel.ts     # Calendar views component
│   ├── TasksPanel.ts        # Tasks management component
│   ├── MessageRenderer.ts   # Message rendering
│   ├── DragManager.ts       # Drag & drop logic
│   ├── CalendarTools.ts     # Tool registry (20+ tools)
│   ├── GeminiAgent.ts       # Gemini AI agent
│   ├── GoogleCalendarAPI.ts # Google Calendar REST wrapper
│   ├── GoogleTasksAPI.ts    # Google Tasks REST wrapper
│   ├── OAuthManager.ts      # OAuth 2.0 PKCE flow
│   ├── SafetyLayer.ts       # Safety confirmations & undo
│   ├── VaultContext.ts      # Vault context scanning
│   ├── Logger.ts            # Structured logging
│   ├── RetryUtils.ts        # Exponential backoff
│   └── EncryptionUtils.ts   # Token encryption
├── tests/
│   ├── *.test.ts            # Unit & integration tests
│   └── mocks/               # Test mocks
├── docs/                    # API documentation
├── styles.css               # Main styles
├── styles-chat.css          # Chat panel styles
├── styles-calendar.css      # Calendar panel styles
├── styles-tasks.css         # Tasks panel styles
├── jest.config.js           # Jest configuration
├── tsconfig.test.json       # TypeScript config for tests
└── esbuild.config.mjs       # Build configuration
```

## Build

```bash
npm run build
```

Produces `main.js` in the root directory.

## Testing

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npx jest tests/CalendarTools.test.ts
```

### Writing Tests

Tests use Jest with ts-jest. Mock Obsidian API via `tests/mocks/obsidian.mock.ts`.

```typescript
import { Plugin } from "obsidian";

jest.mock("obsidian", () => ({
    Notice: jest.fn(),
    requestUrl: jest.fn(),
    Plugin: class {
        settings = { timezone: "UTC" };
        async loadData() { return {}; }
        async saveData() { return; }
    }
}));
```

## Code Quality

- **TypeScript strict mode**: No `any` types
- **Single Responsibility**: Each file has one purpose
- **Chunked Write**: Max 350 lines per file write
- **Logging**: Use `Logger` utility instead of `console.log`

## Git Workflow

1. Create feature branch from `main`
2. Make changes
3. Run `npm test` and `npm run build`
4. Commit with descriptive message
5. Push and create PR
