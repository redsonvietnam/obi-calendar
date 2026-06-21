import { Notice, normalizePath, TFile } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { GeminiAgent } from "./GeminiAgent";
import { AnalysisHistory } from "./AnalysisHistory";
import { VaultContext } from "./VaultContext";
import { WorkCategoryConfig } from "./WorkCategoryConfig";
import { Logger } from "./Logger";
import {
    DocumentAnalysisResult,
    DocumentAnalysis,
    ActionStep,
    WorkCategory,
    PatternInsights
} from "./types";

export interface DocumentAnalyzerDeps {
    plugin: ObsidianCalendarAgentPlugin;
    geminiAgent: GeminiAgent;
    analysisHistory: AnalysisHistory;
    vaultContext: VaultContext;
    workCategoryConfig: WorkCategoryConfig;
}

const OCR_PROMPT = `Trích xuất toàn bộ nội dung văn bản từ ảnh này. Giữ nguyên thông tin về tên tài liệu, ngày tháng, deadline, con số.`;

const ANALYSIS_PROMPT_SUFFIX = `Phân tích công việc từ nội dung trên và trả về JSON thuần (không markdown, không code block) theo schema:
{
  "jobTitle": "Tên công việc ngắn gọn",
  "description": "Mô tả chi tiết công việc",
  "deadline": "YYYY-MM-DD",
  "estimatedDeadlineDays": number,
  "estimatedHours": number,
  "detectedKeywords": ["từ khóa 1", "từ khóa 2"],
  "actionPlan": [{"title": "bước 1", "estimatedHours": 0.5, "completed": false}],
  "actionPlanEstimates": {"bước 1": 0.5},
  "requiredApprovals": ["người phê duyệt"],
  "riskLevel": "low|medium|high"
}`;

export class DocumentAnalyzer {
    constructor(private readonly deps: DocumentAnalyzerDeps) {}

    async analyzeDocument(imageBase64: string, userContext?: string): Promise<DocumentAnalysisResult> {
        try {
            const cleanBase64 = this.parseImageBase64(imageBase64);
            const extractedText = await this.extractTextViaGemini(cleanBase64);
            const category = this.classifyWorkCategory(extractedText);
            const patterns = await this.deps.analysisHistory.getPatternsForCategory(category);
            const enrichedPrompt = this.buildEnrichedPrompt(category, patterns, extractedText, userContext);
            const analysisResult = await this.runAnalysisPrompt(enrichedPrompt);
            this.enrichWithPatternInsights(analysisResult, patterns);
            const analysisRecord = this.buildAnalysisRecord(analysisResult);
            await this.deps.analysisHistory.logAnalysis(analysisRecord);
            const notePath = await this.saveAnalysisToVault(analysisRecord);
            analysisResult.patternInsights = {
                similarTasksCount: patterns.totalAnalyzed,
                averageDeadlineDays: patterns.avgDeadlineDays,
                estimateAccuracy: patterns.estimateAccuracy,
                confidenceLevel: patterns.totalAnalyzed >= 10 ? "high" : patterns.totalAnalyzed >= 5 ? "medium" : "low"
            };
            return analysisResult;
        } catch (error) {
            Logger.error("DocumentAnalyzer", "analyzeDocument failed", error);
            new Notice(`Lỗi phân tích tài liệu: ${(error as Error).message}`);
            throw error;
        }
    }

    private parseImageBase64(imageData: string): string {
        const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
        const estimatedBytes = (base64.length * 3) / 4;
        if (estimatedBytes > 5 * 1024 * 1024) {
            throw new Error("Ảnh quá lớn (>5MB). Vui lòng nén hoặc resize.");
        }
        return base64;
    }

    private async extractTextViaGemini(imageBase64: string): Promise<string> {
        const vaultSnapshot = await this.deps.vaultContext.buildSnapshot();
        const result = await this.deps.geminiAgent.run(
            OCR_PROMPT,
            [],
            this.deps.plugin.settings.timezone,
            vaultSnapshot,
            undefined,
            ["list_events", "create_event", "update_event", "delete_event",
             "get_vault_context", "write_vault_note", "append_vault_note",
             "list_task_lists", "create_task_list", "delete_task_list",
             "list_tasks", "create_task", "update_task", "patch_task", "delete_task",
             "analyze_document_image", "create_task_from_analysis", "create_event_from_analysis"],
            imageBase64
        );
        const text = result.assistantText?.trim();
        if (!text) {
            throw new Error("Gemini không trích xuất được văn bản từ ảnh.");
        }
        return text;
    }

    private classifyWorkCategory(text: string): WorkCategory {
        return this.deps.workCategoryConfig.classifyByKeywords(text);
    }

    private buildEnrichedPrompt(
        category: WorkCategory,
        patterns: PatternInsights,
        extractedText: string,
        userContext?: string
    ): string {
        const parts: string[] = [];

        const config = this.deps.workCategoryConfig.getConfig(category);
        parts.push(config.systemPrompt);

        if (patterns.totalAnalyzed > 0) {
            parts.push(
                `DỰA TRÊN LỊCH SỬ ${patterns.totalAnalyzed} CÔNG VIỆC TƯƠNG TỰ:\n` +
                `- Deadline trung bình: ${patterns.avgDeadlineDays} ngày (±${patterns.stdDevDays})\n` +
                `- Thời gian thực tế: ${patterns.avgHours} giờ (±${patterns.stdDevHours})\n` +
                `- Độ chính xác của AI: ${patterns.estimateAccuracy}%\n` +
                `- Keywords thường gặp: ${patterns.commonKeywords.join(", ")}\n\n` +
                `LƯU Ý: Nếu estimate của bạn lệch quá so với pattern (>20%), hãy giải thích chi tiết tại sao công việc này khác biệt.`
            );
        }

        parts.push(
            `Nội dung từ tài liệu:\n${extractedText}` +
            (userContext ? `\n\nNgữ cảnh từ user:\n${userContext}` : "")
        );

        parts.push(ANALYSIS_PROMPT_SUFFIX);
        return parts.join("\n\n");
    }

    private async runAnalysisPrompt(enrichedPrompt: string): Promise<DocumentAnalysisResult> {
        const vaultSnapshot = await this.deps.vaultContext.buildSnapshot();
        const result = await this.deps.geminiAgent.run(
            enrichedPrompt,
            [],
            this.deps.plugin.settings.timezone,
            vaultSnapshot,
            undefined,
            ["list_events", "create_event", "update_event", "delete_event",
             "get_vault_context", "write_vault_note", "append_vault_note",
             "list_task_lists", "create_task_list", "delete_task_list",
             "list_tasks", "create_task", "update_task", "patch_task", "delete_task",
             "analyze_document_image", "create_task_from_analysis", "create_event_from_analysis"]
        );

        const text = result.assistantText?.trim();
        if (!text) {
            throw new Error("Gemini không trả kết quả phân tích.");
        }

        return this.parseAnalysisJson(text);
    }

    private parseAnalysisJson(text: string): DocumentAnalysisResult {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Không tìm thấy JSON hợp lệ trong phản hồi của Gemini.");
        }

        try {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                jobTitle: parsed.jobTitle || "Không xác định",
                description: parsed.description || "",
                category: this.parseWorkCategory(parsed.category),
                detectedKeywords: Array.isArray(parsed.detectedKeywords) ? parsed.detectedKeywords : [],
                deadline: parsed.deadline || new Date().toISOString().slice(0, 10),
                estimatedDeadlineDays: typeof parsed.estimatedDeadlineDays === "number" ? parsed.estimatedDeadlineDays : 7,
                estimatedHours: typeof parsed.estimatedHours === "number" ? parsed.estimatedHours : 4,
                actionPlan: Array.isArray(parsed.actionPlan)
                    ? parsed.actionPlan.map((s: unknown, i: number) => {
                        if (typeof s === "string") {
                            return { title: s, estimatedHours: 1, completed: false };
                        }
                        const st = s as Record<string, unknown>;
                        return {
                            title: String(st.title || `Bước ${i + 1}`),
                            estimatedHours: typeof st.estimatedHours === "number" ? st.estimatedHours : 1,
                            completed: !!st.completed
                        } as ActionStep;
                    })
                    : [{ title: "Xem xét yêu cầu", estimatedHours: 1, completed: false }],
                actionPlanEstimates: typeof parsed.actionPlanEstimates === "object" ? parsed.actionPlanEstimates as Record<string, number> : undefined,
                requiredApprovals: Array.isArray(parsed.requiredApprovals) ? parsed.requiredApprovals : [],
                riskLevel: this.parseRiskLevel(parsed.riskLevel)
            };
        } catch (error) {
            Logger.error("DocumentAnalyzer", "JSON parse error", error);
            throw new Error("Không thể parse kết quả phân tích từ Gemini.");
        }
    }

    private parseWorkCategory(value: unknown): WorkCategory {
        if (typeof value === "string" && Object.values(WorkCategory).includes(value as WorkCategory)) {
            return value as WorkCategory;
        }
        for (const cat of Object.values(WorkCategory)) {
            if (cat !== WorkCategory.UNKNOWN && value === cat) {
                return cat;
            }
        }
        return WorkCategory.UNKNOWN;
    }

    private parseRiskLevel(value: unknown): "low" | "medium" | "high" {
        if (value === "low" || value === "medium" || value === "high") return value;
        return "medium";
    }

    private enrichWithPatternInsights(result: DocumentAnalysisResult, patterns: PatternInsights): void {
        if (patterns.totalAnalyzed > 0) {
            result.patternInsights = {
                similarTasksCount: patterns.totalAnalyzed,
                averageDeadlineDays: patterns.avgDeadlineDays,
                estimateAccuracy: patterns.estimateAccuracy,
                confidenceLevel: patterns.totalAnalyzed >= 10 ? "high" : patterns.totalAnalyzed >= 5 ? "medium" : "low"
            };
        }
    }

    private buildAnalysisRecord(result: DocumentAnalysisResult): DocumentAnalysis {
        return {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            category: result.category,
            jobTitle: result.jobTitle,
            description: result.description,
            detectedKeywords: result.detectedKeywords,
            estimatedDeadlineDays: result.estimatedDeadlineDays,
            estimatedHours: result.estimatedHours,
            estimatedRiskLevel: result.riskLevel,
            actionPlan: result.actionPlan.map(s => s.title),
            actionPlanEstimates: result.actionPlanEstimates,
            requiredApprovals: result.requiredApprovals
        };
    }

    private async saveAnalysisToVault(analysis: DocumentAnalysis): Promise<string> {
        const date = new Date();
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const dateStr = analysis.timestamp.slice(0, 10);
        const catSlug = analysis.category.replace(/_/g, "-").toLowerCase();
        const titleSlug = analysis.jobTitle
            .toLowerCase()
            .replace(/[^a-z0-9\u00e0-\u1ef9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 50);
        const filename = `${dateStr}-${catSlug}-${titleSlug}.md`;
        const filePath = normalizePath(`_document-analysis/by-date/${yearMonth}/${filename}`);

        const content = this.buildNoteContent(analysis);
        const file = this.deps.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.deps.plugin.app.vault.modify(file, content);
        } else {
            const parent = normalizePath(`_document-analysis/by-date/${yearMonth}`);
            if (!this.deps.plugin.app.vault.getAbstractFileByPath(parent)) {
                await this.deps.plugin.app.vault.createFolder(parent);
            }
            await this.deps.plugin.app.vault.create(filePath, content);
        }
        return filePath;
    }

    private buildNoteContent(analysis: DocumentAnalysis): string {
        const categoryName = this.deps.workCategoryConfig.getConfig(analysis.category).displayName;
        const planItems = analysis.actionPlan.map(step => `- [ ] ${step}`).join("\n");
        const estimateStr = analysis.actualDeadlineDays
            ? `**Actual:** ${analysis.actualDeadlineDays} days`
            : "**Status:** Pending";

        return [
            `# ${analysis.jobTitle}`,
            "",
            `**Category:** ${categoryName}`,
            `**Deadline:** ${analysis.timestamp.slice(0, 10)}`,
            `**Estimated Effort:** ${analysis.estimatedHours} hours`,
            `**Status:** Created at ${analysis.timestamp}`,
            `**Source:** Document analysis`,
            "",
            "## Metadata",
            `- Analysis ID: ${analysis.id}`,
            analysis.googleTaskId ? `- Google Task ID: ${analysis.googleTaskId}` : null,
            analysis.vaultNoteId ? `- Vault Note ID: ${analysis.vaultNoteId}` : null,
            "",
            "## Action Plan",
            planItems,
            "",
            `## Feedback (Auto-updated)`,
            estimateStr
        ].filter(line => line !== null).join("\n");
    }
}
