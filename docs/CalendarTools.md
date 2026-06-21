# CalendarTools

Tool registry cho Gemini function calling. Quản lý 20+ tools cho Calendar, Tasks, Vault operations.

## Tool Declaration

```typescript
tools.getGeminiToolDeclarations(excludeTools?: string[]): ToolDefinition[]
```

## Tool Execution

```typescript
tools.executeTool(call: ToolCallRequest): Promise<ToolExecutionResult>
```

## Calendar Tools

### list_events
Liệt kê sự kiện từ Google Calendar.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| calendarId | string | No | Calendar ID (default: "primary") |
| timeMin | string | No | RFC3339 start time |
| timeMax | string | No | RFC3339 end time |
| maxResults | number | No | Max events (default: 20) |
| q | string | No | Search keyword |

---

### create_event
Tạo sự kiện mới.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| summary | string | **Yes** | Event title |
| startDateTime | string | **Yes** | RFC3339 start |
| endDateTime | string | **Yes** | RFC3339 end |
| calendarId | string | No | Calendar ID |
| description | string | No | Event description |
| location | string | No | Event location |
| timeZone | string | No | IANA timezone |
| sourceNotePath | string | No | Obsidian file path for deep link |

---

### update_event
Cập nhật sự kiện (full replace).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| eventId | string | **Yes** | Event ID to update |
| calendarId | string | No | Calendar ID |
| summary | string | No | New title |
| startDateTime | string | No | New start |
| endDateTime | string | No | New end |

---

### delete_event
Xóa sự kiện.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| eventId | string | **Yes** | Event ID to delete |
| calendarId | string | No | Calendar ID |

## Google Tasks Tools

### list_task_lists
Liệt kê danh sách task.

---

### create_task_list
Tạo danh sách task mới.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | **Yes** | List title |

---

### delete_task_list
Xóa danh sách task.

---

### list_tasks
Liệt kê task trong danh sách.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| tasklistId | string | No | Task list ID |
| maxResults | number | No | Max tasks |
| showCompleted | boolean | No | Include completed |
| sortBy | string | No | "newList", "due", "updated" |

---

### create_task
Tạo task mới.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | **Yes** | Task title |
| tasklistId | string | No | Task list ID |
| notes | string | No | Task notes |
| due | string | No | RFC3339 due date |
| sourceNotePath | string | No | Obsidian deep link |

---

### update_task
Cập nhật task (full replace).

---

### patch_task
Cập nhật task (partial).

---

### delete_task
Xóa task.

## Vault Tools

### get_vault_context
Đọc ngữ cảnh vault (daily notes, tasks, projects).

---

### write_vault_note
Ghi đè hoặc tạo file trong vault.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | **Yes** | File path |
| content | string | **Yes** | Markdown content |

---

### append_vault_note
Thêm nội dung vào cuối file.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | **Yes** | File path |
| contentToAppend | string | **Yes** | Content to append |

## Error Handling

All tools return:
```typescript
{ ok: true, data: <result> }  // success
{ ok: false, error: "<message>" }  // failure
```

Safety confirmations required for: create_event, update_event, delete_event, write_note.
