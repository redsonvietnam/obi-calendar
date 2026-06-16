import { Modal, Notice, Setting } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { DocumentAnalysisResult, PatternInsights } from "./types";

export type SafetyActionType = "create_event" | "update_event" | "delete_event" | "write_note" | "analyze_document";

export interface SafetyConfirmRequest {
    action: SafetyActionType;
    summary: string;
    details?: string[];
}

export interface UndoEntry {
    id: string;
    label: string;
    rollback: () => Promise<void>;
    createdAt: string;
}

/**
 * Safety layer:
 * - Confirm trước khi thao tác tạo/sửa/xóa lịch
 * - Lưu undo buffer để có thể rollback thao tác gần nhất
 */
export class SafetyLayer {
    private readonly plugin: ObsidianCalendarAgentPlugin;
    private readonly undoBuffer: UndoEntry[] = [];
    private readonly maxUndoEntries = 20;

    constructor(plugin: ObsidianCalendarAgentPlugin) {
        this.plugin = plugin;
    }

    async confirm(request: SafetyConfirmRequest): Promise<boolean> {
        // Nếu user tắt safety confirm trong settings thì bỏ qua confirm.
        if (!this.plugin.settings.requireSafetyConfirm) {
            return true;
        }

        try {
            const accepted = await this.openConfirmModal(request);
            if (!accepted) {
                new Notice("Đã hủy thao tác theo yêu cầu an toàn.");
            }
            return accepted;
        } catch (error) {
            console.error("[SafetyLayer] confirm failed", error);
            new Notice("Không thể mở hộp thoại xác nhận. Từ chối thao tác để an toàn.");
            return false;
        }
    }

    registerUndo(entry: UndoEntry): void {
        this.undoBuffer.unshift(entry);
        if (this.undoBuffer.length > this.maxUndoEntries) {
            this.undoBuffer.pop();
        }
    }

    getUndoEntries(): UndoEntry[] {
        return [...this.undoBuffer];
    }

    async undoLast(): Promise<boolean> {
        const latest = this.undoBuffer.shift();
        if (!latest) {
            new Notice("Không có thao tác nào để hoàn tác.");
            return false;
        }

        try {
            await latest.rollback();
            new Notice(`Đã hoàn tác: ${latest.label}`);
            return true;
        } catch (error) {
            console.error("[SafetyLayer] undo failed", error);
            new Notice(`Hoàn tác thất bại: ${(error as Error).message}`);
            return false;
        }
    }

    async confirmAnalysis(
        analysis: DocumentAnalysisResult,
        patterns: PatternInsights
    ): Promise<{ confirmed: boolean }> {
        return new Promise((resolve) => {
            const modal = new DocumentAnalysisConfirmModal(
                this.plugin,
                analysis,
                patterns,
                (confirmed) => resolve({ confirmed })
            );
            modal.open();
        });
    }

    private openConfirmModal(request: SafetyConfirmRequest): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new SafetyConfirmModal(this.plugin, request, resolve);
            modal.open();
        });
    }
}

class SafetyConfirmModal extends Modal {
    private readonly request: SafetyConfirmRequest;
    private readonly onDone: (accepted: boolean) => void;
    private resolved = false;

    constructor(
        plugin: ObsidianCalendarAgentPlugin,
        request: SafetyConfirmRequest,
        onDone: (accepted: boolean) => void
    ) {
        super(plugin.app);
        this.request = request;
        this.onDone = onDone;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h3", { text: "Xác nhận thao tác lịch" });
        contentEl.createEl("p", {
            text: this.request.summary
        });

        if (this.request.details?.length) {
            const listEl = contentEl.createEl("ul");
            for (const line of this.request.details) {
                listEl.createEl("li", { text: line });
            }
        }

        const actionRow = contentEl.createDiv({ cls: "oca-confirm-actions" });
        const cancelBtn = actionRow.createEl("button", { text: "Hủy" });
        cancelBtn.addEventListener("click", () => {
            this.finish(false);
            this.close();
        });

        const confirmBtn = actionRow.createEl("button", {
            text: "Xác nhận",
            cls: "mod-warning"
        });
        confirmBtn.addEventListener("click", () => {
            this.finish(true);
            this.close();
        });
    }

    onClose(): void {
        this.contentEl.empty();
        // Đóng modal bằng ESC hoặc click outside => xem như từ chối
        this.finish(false);
    }

    private finish(accepted: boolean): void {
        if (this.resolved) return;
        this.resolved = true;
        this.onDone(accepted);
    }
}

class DocumentAnalysisConfirmModal extends Modal {
    private readonly analysis: DocumentAnalysisResult;
    private readonly patterns: PatternInsights;
    private readonly onDone: (confirmed: boolean) => void;
    private resolved = false;

    constructor(
        plugin: ObsidianCalendarAgentPlugin,
        analysis: DocumentAnalysisResult,
        patterns: PatternInsights,
        onDone: (confirmed: boolean) => void
    ) {
        super(plugin.app);
        this.analysis = analysis;
        this.patterns = patterns;
        this.onDone = onDone;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("oca-analysis-modal");

        contentEl.createEl("h2", { text: this.analysis.jobTitle });

        const meta = contentEl.createDiv({ cls: "oca-analysis-meta" });
        meta.createEl("span", { text: `📁 ${this.analysis.category}`, cls: "oca-category-badge" });
        meta.createEl("span", { text: `⏰ ${this.analysis.deadline}` });
        meta.createEl("span", { text: `🕐 ${this.analysis.estimatedHours}h` });

        if (this.patterns.totalAnalyzed > 0) {
            const insight = contentEl.createDiv({ cls: "oca-pattern-insight" });
            insight.createEl("strong", {
                text: `✓ ${this.patterns.totalAnalyzed} công việc tương tự: avg ${this.patterns.avgDeadlineDays} ngày, ${this.patterns.estimateAccuracy}% accuracy`
            });
        }

        if (this.analysis.actionPlan.length > 0) {
            const planSection = contentEl.createDiv({ cls: "oca-action-plan" });
            planSection.createEl("h4", { text: "Action Plan:" });
            for (const step of this.analysis.actionPlan) {
                const item = planSection.createEl("label", { cls: "oca-action-step" });
                item.createEl("input", { type: "checkbox" });
                item.appendText(` ${step.title} (${step.estimatedHours}h)`);
            }
        }

        const buttonRow = contentEl.createDiv({ cls: "oca-confirm-actions" });
        const cancelBtn = buttonRow.createEl("button", { text: "❌ Cancel" });
        cancelBtn.addEventListener("click", () => { this.finish(false); this.close(); });

        const editBtn = buttonRow.createEl("button", { text: "✏️ Edit" });
        editBtn.addEventListener("click", () => { this.finish(false); this.close(); });

        const addBtn = buttonRow.createEl("button", { text: "✅ Add to Calendar", cls: "mod-cta" });
        addBtn.addEventListener("click", () => { this.finish(true); this.close(); });
    }

    onClose(): void {
        this.contentEl.empty();
        this.finish(false);
    }

    private finish(confirmed: boolean): void {
        if (this.resolved) return;
        this.resolved = true;
        this.onDone(confirmed);
    }
}