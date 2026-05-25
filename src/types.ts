/**
 * Timezone mặc định cho toàn bộ plugin.
 * Mọi thao tác thời gian sẽ ưu tiên timezone này nếu người dùng chưa cấu hình khác.
 */
export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

export type ChatRole = "user" | "assistant" | "system" | "tool";

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
}

export const DEFAULT_SETTINGS: CalendarAgentSettings = {
    geminiApiKey: "",
    timezone: DEFAULT_TIMEZONE,
    googleClientId: "",
    googleClientSecret: "",
    googleRedirectUri: "",
    autoOpenSidebarOnStart: false,
    requireSafetyConfirm: true
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