export enum WorkCategory {
    PH10 = "PH10_ASSET_MANAGEMENT",
    PC06 = "PC06_WEAPON_LICENSE",
    PV01 = "PV01_ADMIN_STAFF",
    DT = "DT_DIGITAL_TRANSFORMATION",
    NQ57 = "NQ57_IT_DEVELOPMENT",
    ND85 = "ND85_INFO_SECURITY",
}

export interface DocumentAnalysisResult {
    jobTitle: string;
    deadline: string;
    estimatedDays: number;
    estimatedHours: number;
    category: WorkCategory;
    keywords: string[];
    actionPlan: string[];
    requiredApprovals?: string[];
    riskLevel?: "low" | "medium" | "high";
}

export interface PatternInsights {
    totalAnalyzed: number;
    avgDeadlineDays: number;
    stdDevDays: number;
    avgHours: number;
    stdDevHours: number;
    estimateAccuracy: number;
    commonKeywords: string[];
    frequentApprovers: string[];
    riskDistribution: Record<string, number>;
    lastUpdated: string;
}

export interface WorkCategoryConfig {
    id: WorkCategory;
    name: string;
    keywords: string[];
    defaultDeadlineDays: number;
    defaultEffortHours: number;
    systemPrompt: string;
    noteTemplate: string;
}

export interface GeminiPart {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

export interface DocumentAnalysis {
    id: string;
    timestamp: string;
    category: WorkCategory;
    jobTitle: string;
    detectedKeywords: string[];
    estimatedDeadlineDays: number;
    actualDeadlineDays?: number;
    estimatedHours: number;
    actualHours?: number;
    actionPlan: string[];
    actionPlanEstimates?: Record<string, number>;
    requiredApprovals?: string[];
    riskLevel?: "low" | "medium" | "high";
    userFeedback?: "accurate" | "too_short" | "too_long";
    notes?: string;
    googleTaskId?: string;
    googleEventId?: string;
    vaultNoteId?: string;
}

// Restore missing types to fix TS errors in CalendarView.ts
export interface ChatMessage {
    role: 'user' | 'model';
    content: string;
    timestamp: number;
}

export interface GoogleCalendarEvent {
    id: string;
    summary: string;
    start: { dateTime: string };
    end: { dateTime: string };
    description?: string;
    location?: string;
}

export interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiPart[];
}
</write_to_file>