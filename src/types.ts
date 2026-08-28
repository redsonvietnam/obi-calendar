/**
 * Types for Obsidian Calendar Agent
 */

export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

export enum WorkCategory {
    PH10_ASSET_MANAGEMENT = "PH10_ASSET_MANAGEMENT",
    PC06_WEAPON_LICENSE = "PC06_WEAPON_LICENSE",
    PV01_ADMIN_DOCS = "PV01_ADMIN_DOCS",
    DT_DIGITAL_TRANSFORM = "DT_DIGITAL_TRANSFORM",
    NQ57_IT_DEVELOPMENT = "NQ57_IT_DEVELOPMENT",
    ND85_INFO_SECURITY = "ND85_INFO_SECURITY",
    UNKNOWN = "UNKNOWN"
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
    documentAnalysis?: {
        enablePatternLearning: boolean;
        showPatternInsights: boolean;
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
    calendarRefreshInterval: 60,
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

export type CalendarViewMode = "day" | "week" | "month" | "timeline";

export type ActiveTab = "chat" | "calendar" | "tasks";

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
    inlineData?: {
        mimeType: "image/jpeg" | "image/png" | "image/webp";
        data: string;
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
    tasklist?: string; // Task list ID (Google Tasks API field)
}

export interface GoogleTaskList {
    id: string;
    title: string;
}

export interface ActionStep {
    title: string;
    description?: string;
    estimatedHours: number;
    completed: boolean;
}

export interface DocumentAnalysisResult {
    jobTitle: string;
    description: string;
    category: WorkCategory;
    detectedKeywords: string[];
    deadline: string;
    estimatedDeadlineDays: number;
    estimatedHours: number;
    actionPlan: ActionStep[];
    actionPlanEstimates?: Record<string, number>;
    requiredApprovals: string[];
    riskLevel: "low" | "medium" | "high";
    patternInsights?: {
        similarTasksCount: number;
        averageDeadlineDays: number;
        estimateAccuracy: number;
        confidenceLevel: "high" | "medium" | "low";
    };
}

export interface DocumentAnalysis {
    id: string;
    timestamp: string;
    category: WorkCategory;
    jobTitle: string;
    description?: string;
    detectedKeywords: string[];
    estimatedDeadlineDays: number;
    estimatedHours: number;
    estimatedRiskLevel: "low" | "medium" | "high";
    actualDeadlineDays?: number;
    actualHours?: number;
    actionPlan: string[];
    actionPlanEstimates?: Record<string, number>;
    requiredApprovals?: string[];
    userFeedback?: "accurate" | "too_short" | "too_long";
    feedbackComment?: string;
    googleTaskId?: string;
    googleEventId?: string;
    vaultNoteId?: string;
    notes?: string;
}

export interface PatternInsights {
    category: WorkCategory;
    totalAnalyzed: number;
    avgDeadlineDays: number;
    stdDevDays: number;
    avgHours: number;
    stdDevHours: number;
    estimateAccuracy: number;
    earlyCompletionRate: number;
    lateCompletionRate: number;
    commonKeywords: string[];
    frequentApprovers: string[];
    riskDistribution: {
        low: number;
        medium: number;
        high: number;
    };
    lastUpdated: string;
    dataQuality: "high" | "medium" | "low";
}

export interface WorkCategoryConfig {
    id: WorkCategory;
    displayName: string;
    keywords: string[];
    defaultDeadlineDays: number;
    estimatedEffortHours: number;
    actionPlanTemplate: string[];
    systemPrompt: string;
}

export interface WorkAnalysisInsights {
    totalAnalyzed: number;
    byCategory: Record<WorkCategory, {
        count: number;
        avgDays: number;
        accuracy: number;
    }>;
    estimateQuality: string;
    recommendations: string[];
}
