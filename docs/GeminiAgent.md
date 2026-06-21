# GeminiAgent

Gemini AI agent với native function calling cho Calendar + Tasks management.

## Architecture

```
User Message
    ↓
GeminiAgent.run()
    ↓
generateContent() → Gemini API
    ↓
┌─ Text Response → Return to user
└─ Function Call → executeTool() → send result back → loop
```

## Constructor

```typescript
new GeminiAgent(plugin: ObsidianCalendarAgentPlugin, tools: CalendarTools)
```

## Methods

### run

```typescript
async run(
    userMessage: string,
    history: GeminiContent[],
    timezone: string,
    vaultSnapshot: string,
    signal?: AbortSignal,
    excludedTools?: string[],
    imageBase64?: string
): Promise<AgentRunResult & { updatedHistory: GeminiContent[] }>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| userMessage | string | User's message |
| history | GeminiContent[] | Previous conversation turns |
| timezone | string | User's timezone |
| vaultSnapshot | string | Current vault context |
| signal | AbortSignal | Cancel signal |
| excludedTools | string[] | Tools to exclude from declarations |
| imageBase64 | string | Base64 image for vision |

**Returns:**
```typescript
{
    assistantText: string;
    toolTrace: Array<{
        toolName: string;
        arguments: Record<string, unknown>;
        result: ToolExecutionResult;
    }>;
    updatedHistory: GeminiContent[];
}
```

## Model Fallback

Automatically tries multiple Gemini models:
1. gemini-flash-latest
2. gemini-flash-lite-latest
3. gemini-pro-latest
4. gemini-2.5-flash
5. gemini-2.0-flash
6. gemini-1.5-flash

Handles quota (429), model not found (404), and permission errors.

## Function Calling Loop

1. Send user message + tools to Gemini
2. If model returns function call → execute tool
3. Send tool result back to model
4. Repeat until model returns text (max 6 rounds)

## Error Handling

- Missing API key → throws immediately
- Empty/invalid response → throws
- Max rounds exceeded → throws
- Abort signal → throws "Operation cancelled"
