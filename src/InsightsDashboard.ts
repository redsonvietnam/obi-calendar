import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { AnalysisHistory } from "./AnalysisHistory";
import { WorkCategoryConfig } from "./WorkCategoryConfig";
import { WorkCategory, PatternInsights } from "./types";
import { Logger } from "./Logger";

export const VIEW_TYPE_INSIGHTS_DASHBOARD = "obsidian-calendar-agent-insights";

export class InsightsDashboard extends ItemView {
    private plugin: ObsidianCalendarAgentPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianCalendarAgentPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_INSIGHTS_DASHBOARD;
    }

    getDisplayText(): string {
        return "Work Analysis Insights";
    }

    getIcon(): string {
        return "bar-chart";
    }

    async onOpen(): Promise<void> {
        await this.render();
    }

    private async render(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        const analysisHistory = this.plugin.analysisHistory;
        if (!analysisHistory) {
            contentEl.createEl("p", { text: "Analysis History chưa được khởi tạo." });
            return;
        }

        try {
            const allAnalyses = await analysisHistory.getAllAnalyses();
            contentEl.createEl("h2", { text: `📊 Work Analysis Insights (${allAnalyses.length} items)` });

            const categoryConfig = this.plugin.workCategoryConfig;
            const categories = categoryConfig.getAllCategories();

            for (const cat of categories) {
                const config = categoryConfig.getConfig(cat);
                const patterns = await analysisHistory.getPatternsForCategory(cat);
                this.renderCategoryStats(contentEl, config.displayName, patterns);
            }

            if (allAnalyses.length > 0) {
                this.renderRecentFeedback(contentEl, analysisHistory, categories);
            }
        } catch (error) {
            Logger.error("InsightsDashboard", "render failed", error);
            contentEl.createEl("p", { text: "Lỗi tải dữ liệu." });
        }
    }

    private renderCategoryStats(
        container: HTMLElement,
        displayName: string,
        patterns: PatternInsights
    ): void {
        const section = container.createDiv({ cls: "oca-insights-category" });
        section.createEl("h3", { text: displayName });

        const stats = section.createDiv({ cls: "oca-insights-stats" });
        stats.createEl("p", {
            text: `✓ ${patterns.totalAnalyzed} analyses | Avg ${patterns.avgDeadlineDays} days | Effort: ${patterns.avgHours}h`
        });

        const accuracyColor = patterns.estimateAccuracy >= 90 ? "🟢" : patterns.estimateAccuracy >= 70 ? "🟡" : "🔴";
        stats.createEl("p", {
            text: `${accuracyColor} Estimate Accuracy: ${patterns.estimateAccuracy}%`
        });

        if (patterns.commonKeywords.length > 0) {
            stats.createEl("p", {
                text: `Keywords: ${patterns.commonKeywords.slice(0, 5).join(", ")}`
            });
        }

        if (patterns.frequentApprovers.length > 0) {
            stats.createEl("p", {
                text: `Approvers: ${patterns.frequentApprovers.join(", ")}`
            });
        }

        const risk = patterns.riskDistribution;
        stats.createEl("p", {
            text: `Risk: Low ${risk.low}% | Medium ${risk.medium}% | High ${risk.high}%`
        });

        const quality = patterns.dataQuality === "high" ? "🟢" : patterns.dataQuality === "medium" ? "🟡" : "⚪";
        stats.createEl("p", {
            text: `${quality} Data Quality: ${patterns.dataQuality.toUpperCase()}`
        });
    }

    private async renderRecentFeedback(
        container: HTMLElement,
        analysisHistory: AnalysisHistory,
        categories: WorkCategory[]
    ): Promise<void> {
        const section = container.createDiv({ cls: "oca-insights-feedback" });
        section.createEl("h3", { text: "Recent Feedback" });

        for (const cat of categories) {
            const catAnalyses = await analysisHistory.getHistoryByCategory(cat, 5);
            const withFeedback = catAnalyses.filter(a => a.userFeedback);
            if (withFeedback.length === 0) continue;

            const config = this.plugin.workCategoryConfig.getConfig(cat);
            const list = section.createEl("ul");
            for (const a of withFeedback.slice(0, 3)) {
                const feedbackIcon = a.userFeedback === "accurate" ? "✅" : a.userFeedback === "too_long" ? "⚠️" : "⏱️";
                list.createEl("li", {
                    text: `${feedbackIcon} ${a.jobTitle} (${config.displayName}) — ${a.userFeedback}`
                });
            }
        }
    }

    async refresh(): Promise<void> {
        await this.render();
    }
}
