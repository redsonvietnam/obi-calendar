# GoogleTasksAPI

REST wrapper cho Google Tasks API v1.

## Constructor

```typescript
new GoogleTasksAPI(plugin: ObsidianCalendarAgentPlugin, oauthManager: OAuthManager)
```

## Methods

### listTaskLists

```typescript
listTaskLists(params?: ListTaskListsParams): Promise<GoogleTaskList[]>
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| maxResults | number | - | Max task lists to return |

---

### getTaskList

```typescript
getTaskList(tasklistId: string): Promise<GoogleTaskList>
```

---

### createTaskList

```typescript
createTaskList(title: string): Promise<GoogleTaskList>
```

---

### deleteTaskList

```typescript
deleteTaskList(tasklistId: string): Promise<void>
```

---

### listTasks

```typescript
listTasks(params?: ListTasksParams): Promise<GoogleTask[]>
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| tasklist | string | "@default" | Task list ID |
| maxResults | number | - | Max tasks to return |
| showCompleted | boolean | - | Include completed tasks |
| showDeleted | boolean | - | Include deleted tasks |
| showHidden | boolean | - | Include hidden tasks |
| sortBy | string | - | Sort order: "newList", "due", "updated" |

---

### getTask

```typescript
getTask(tasklistId: string, taskId: string): Promise<GoogleTask>
```

---

### createTask

```typescript
createTask(tasklistId: string, task: Partial<GoogleTask>): Promise<GoogleTask>
```

**Required:** `title` field.

---

### updateTask

```typescript
updateTask(tasklistId: string, taskId: string, task: Partial<GoogleTask>): Promise<GoogleTask>
```

---

### patchTask

```typescript
patchTask(tasklistId: string, taskId: string, partial: Partial<GoogleTask>): Promise<GoogleTask>
```

---

### deleteTask

```typescript
deleteTask(tasklistId: string, taskId: string): Promise<void>
```

## Error Handling

Same as GoogleCalendarAPI. Transient errors retried with exponential backoff.
