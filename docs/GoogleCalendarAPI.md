# GoogleCalendarAPI

REST wrapper cho Google Calendar API v3.

## Constructor

```typescript
new GoogleCalendarAPI(plugin: ObsidianCalendarAgentPlugin, oauthManager: OAuthManager)
```

## Methods

### listEvents

```typescript
listEvents(params?: ListEventsParams): Promise<GoogleCalendarEvent[]>
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| calendarId | string | "primary" | Calendar ID |
| timeMin | string | - | RFC3339 start time |
| timeMax | string | - | RFC3339 end time |
| maxResults | number | 20 | Max events to return |
| singleEvents | boolean | true | Expand recurring events |
| orderBy | string | "startTime" | Sort order |
| timeZone | string | plugin timezone | Timezone for response |
| q | string | - | Free text search |

**Returns:** `GoogleCalendarEvent[]`

**Errors:** Throws if API returns non-2xx status.

---

### getEvent

```typescript
getEvent(calendarId: string, eventId: string): Promise<GoogleCalendarEvent>
```

---

### createEvent

```typescript
createEvent(calendarId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent>
```

**Required fields:** `start` and `end` with either `dateTime` or `date`.

---

### updateEvent

```typescript
updateEvent(calendarId: string, eventId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent>
```

---

### patchEvent

```typescript
patchEvent(calendarId: string, eventId: string, partial: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent>
```

---

### deleteEvent

```typescript
deleteEvent(calendarId: string, eventId: string): Promise<void>
```

## Error Handling

All methods throw `Error` with `apiError` property containing:

```typescript
interface GoogleCalendarApiError {
    code: number;
    message: string;
    status?: string;
    details?: unknown;
}
```

Transient errors (429, 5xx) are automatically retried with exponential backoff.
