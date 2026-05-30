/**
 * Timezone mặc định cho toàn bộ plugin.
 * Mọi thao tác thời gian sẽ ưu tiên timezone này nếu người dùng chưa cấu hình khác.
 */
export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

export type ChatRole = "user" | "assistant" | "system" | "tool" | "proposal";

export interface ChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    createdAt: string; // ISO string
    toolCallId?: string;
    toolName?: string;
}

export interface GeminiToolCall {
    id: string;
    name: string;
    argumentsJson: string;
}

export interface GeminiToolResult {
    toolCallId: string;
    name: string;
    success: boolean;
    result: unknown;
    error?: string;
}

export interface CalendarAgentSettings {
    geminiApiKey: string;
    timezone: string;
    googleClientId: string;
    googleClientSecret: string;
    googleRedirectUri: string;
    autoOpenSidebarOnStart: boolean;
    requireSafetyConfirm: boolean;
    calendarRefreshInterval: number; // in seconds
    dailyNotesFolder: string;
    projectNotesFolder: string;
    inboxFolder: string;
    sync: {
        enabled: boolean;
        intervalMinutes: number;
        syncTasks: boolean;
        syncCalendar: boolean;
    };
}

export const DEFAULT_SETTINGS: CalendarAgentSettings = {
    geminiApiKey: "",
    timezone: DEFAULT_TIMEZONE,
    googleClientId: "",
    googleClientSecret: "",
    googleRedirectUri: "",
    autoOpenSidebarOnStart: false,
    requireSafetyConfirm: true,
    calendarRefreshInterval: 60, // Default to 60 seconds
    dailyNotesFolder: "Daily",
    projectNotesFolder: "Projects",
    inboxFolder: "Inbox",
    sync: {
        enabled: false,
        intervalMinutes: 15,
        syncTasks: true,
        syncCalendar: true,
    },
};

export interface OAuthTokenData {
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    scope: string;
    expiresAt: number; // Unix epoch ms
}

export interface GoogleCalendarEventDateTime {
    date?: string; // all-day event (YYYY-MM-DD)
    dateTime?: string; // RFC3339 datetime
    timeZone?: string;
}

export interface GeminiPart {
    text?: string;
    functionCall?: {
        name: string;
        args?: Record<string, unknown>;
    };
    functionResponse?: {
        name: string;
        response: Record<string, unknown>;
    };
}

export interface GeminiContent {
    role: "user" | "model" | "tool";
    parts: GeminiPart[];
}

export interface GoogleCalendarEvent {
    id?: string;
    summary?: string;
    description?: string;
    location?: string;
    status?: string;
    htmlLink?: string;
    start: GoogleCalendarEventDateTime;
    end: GoogleCalendarEventDateTime;
    attendees?: Array<{
        email: string;
        displayName?: string;
        responseStatus?: string;
    }>;
}

export interface GoogleTask {
    id?: string;
    title?: string;
    notes?: string;
    status?: "needsAction" | "completed";
    due?: string; // RFC3339
    completed?: string; // RFC3339
}

export interface GoogleTaskList {
    id: string;
    title: string;
}
