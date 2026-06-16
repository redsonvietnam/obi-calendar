import { TFile, normalizePath } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { DocumentAnalysis, PatternInsights, WorkCategory } from "./types";

export class AnalysisHistory {
    private readonly BASE_FOLDER = "_document-analysis";
    private readonly METADATA_FOLDER = "_document-analysis/metadata";
    private readonly HISTORY_FILE = "_document-analysis/metadata/analysis-history.jsonl";

    constructor(private readonly plugin: ObsidianCalendarAgentPlugin) {}

    async initialize(): Promise<void> {
        await this.ensureFolder(this.BASE_FOLDER);
        await this.ensureFolder(this.METADATA_FOLDER);
        await this.ensureFolder("_document-analysis/by-date");
        await this.ensureFolder("_document-analysis/config");
    }

    private async ensureFolder(path: string): Promise<void> {
        const normalized = normalizePath(path);
        if (!this.plugin.app.vault.getAbstractFileByPath(normalized)) {
            try {
                await this.plugin.app.vault.createFolder(normalized);
            } catch {}
        }
    }

    async logAnalysis(analysis: DocumentAnalysis): Promise<string> {
        try {
            const jsonlLine = JSON.stringify(analysis) + "\n";
            const normalized = normalizePath(this.HISTORY_FILE);
            const file = this.plugin.app.vault.getAbstractFileByPath(normalized);

            if (file instanceof TFile) {
                const current = await this.plugin.app.vault.read(file);
                await this.plugin.app.vault.modify(file, current + jsonlLine);
            } else {
                await this.plugin.app.vault.create(normalized, jsonlLine);
            }

            return analysis.id;
        } catch (error) {
            console.error("[AnalysisHistory] logAnalysis failed:", error);
            throw error;
        }
    }

    async getHistoryByCategory(category: WorkCategory, limit?: number): Promise<DocumentAnalysis[]> {
        try {
            const all = await this.readJsonl();
            const filtered = all.filter(a => a.category === category);
            return limit ? filtered.slice(-limit) : filtered;
        } catch (error) {
            console.error("[AnalysisHistory] getHistoryByCategory failed:", error);
            return [];
        }
    }

    async getPatternsForCategory(category: WorkCategory): Promise<PatternInsights> {
        try {
            const analyses = await this.getHistoryByCategory(category);
            if (analyses.length === 0) return this.getDefaultPatterns(category);

            const deadlineDays = analyses.filter(a => a.estimatedDeadlineDays).map(a => a.estimatedDeadlineDays);
            const hours = analyses.filter(a => a.estimatedHours).map(a => a.estimatedHours);

            const avgDays = this.mean(deadlineDays);
            const stdDevDays = this.stdDev(deadlineDays);
            const avgHours = this.mean(hours);
            const stdDevHours = this.stdDev(hours);
            const estimateAccuracy = this.calculateAccuracy(analyses);
            const allKeywords = analyses.flatMap(a => a.detectedKeywords);

            return {
                category,
                totalAnalyzed: analyses.length,
                avgDeadlineDays: Math.round(avgDays * 10) / 10,
                stdDevDays: Math.round(stdDevDays * 10) / 10,
                avgHours: Math.round(avgHours * 10) / 10,
                stdDevHours: Math.round(stdDevHours * 10) / 10,
                estimateAccuracy,
                earlyCompletionRate: this.calculateEarlyRate(analyses),
                lateCompletionRate: this.calculateLateRate(analyses),
                commonKeywords: this.topN(allKeywords, 10),
                frequentApprovers: this.topN(analyses.flatMap(a => a.requiredApprovals ?? []), 5),
                riskDistribution: this.calculateRiskDistribution(analyses),
                lastUpdated: new Date().toISOString(),
                dataQuality: analyses.length >= 10 ? "high" : analyses.length >= 5 ? "medium" : "low"
            };
        } catch (error) {
            console.error("[AnalysisHistory] getPatternsForCategory failed:", error);
            return this.getDefaultPatterns(category);
        }
    }

    async recordFeedback(
        analysisId: string,
        actual: { deadlineDays: number; hours: number; feedback: "accurate" | "too_short" | "too_long" }
    ): Promise<void> {
        try {
            const analyses = await this.readJsonl();
            const updated = analyses.map(a =>
                a.id === analysisId
                    ? { ...a, actualDeadlineDays: actual.deadlineDays, actualHours: actual.hours, userFeedback: actual.feedback }
                    : a
            );
            await this.writeJsonl(updated);

            const entry = updated.find(a => a.id === analysisId);
            if (entry) {
                const patterns = await this.getPatternsForCategory(entry.category);
                await this.savePatternFile(entry.category, patterns);
            }
        } catch (error) {
            console.error("[AnalysisHistory] recordFeedback failed:", error);
            throw error;
        }
    }

    async getAllAnalyses(): Promise<DocumentAnalysis[]> {
        return this.readJsonl();
    }

    private async readJsonl(): Promise<DocumentAnalysis[]> {
        try {
            const normalized = normalizePath(this.HISTORY_FILE);
            const file = this.plugin.app.vault.getAbstractFileByPath(normalized);
            if (!(file instanceof TFile)) return [];

            const content = await this.plugin.app.vault.read(file);
            return content
                .split("\n")
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line) as DocumentAnalysis;
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean) as DocumentAnalysis[];
        } catch {
            return [];
        }
    }

    private async writeJsonl(analyses: DocumentAnalysis[]): Promise<void> {
        const jsonlContent = analyses.map(a => JSON.stringify(a)).join("\n");
        const normalized = normalizePath(this.HISTORY_FILE);
        const file = this.plugin.app.vault.getAbstractFileByPath(normalized);
        if (file instanceof TFile) {
            await this.plugin.app.vault.modify(file, jsonlContent);
        }
    }

    private async savePatternFile(category: WorkCategory, patterns: PatternInsights): Promise<void> {
        const filename = normalizePath(`${this.METADATA_FOLDER}/patterns-${category}.json`);
        const jsonContent = JSON.stringify(patterns, null, 2);
        const file = this.plugin.app.vault.getAbstractFileByPath(filename);
        if (file instanceof TFile) {
            await this.plugin.app.vault.modify(file, jsonContent);
        } else {
            await this.plugin.app.vault.create(filename, jsonContent);
        }
    }

    private mean(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    private stdDev(values: number[]): number {
        if (values.length === 0) return 0;
        const m = this.mean(values);
        const variance = values.reduce((acc, val) => acc + Math.pow(val - m, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    private calculateAccuracy(analyses: DocumentAnalysis[]): number {
        const withFeedback = analyses.filter(a => a.userFeedback);
        if (withFeedback.length === 0) return 85;
        const accurate = withFeedback.filter(a => a.userFeedback === "accurate").length;
        return Math.round((accurate / withFeedback.length) * 100);
    }

    private calculateEarlyRate(analyses: DocumentAnalysis[]): number {
        const withActual = analyses.filter(a => a.actualDeadlineDays && a.estimatedDeadlineDays);
        if (withActual.length === 0) return 0;
        const early = withActual.filter(a => (a.actualDeadlineDays || 0) < (a.estimatedDeadlineDays || 0)).length;
        return Math.round((early / withActual.length) * 100);
    }

    private calculateLateRate(analyses: DocumentAnalysis[]): number {
        const withActual = analyses.filter(a => a.actualDeadlineDays && a.estimatedDeadlineDays);
        if (withActual.length === 0) return 0;
        const late = withActual.filter(a => (a.actualDeadlineDays || 0) > (a.estimatedDeadlineDays || 0)).length;
        return Math.round((late / withActual.length) * 100);
    }

    private calculateRiskDistribution(analyses: DocumentAnalysis[]): { low: number; medium: number; high: number } {
        const total = analyses.length;
        if (total === 0) return { low: 100, medium: 0, high: 0 };
        return {
            low: Math.round((analyses.filter(a => a.estimatedRiskLevel === "low").length / total) * 100),
            medium: Math.round((analyses.filter(a => a.estimatedRiskLevel === "medium").length / total) * 100),
            high: Math.round((analyses.filter(a => a.estimatedRiskLevel === "high").length / total) * 100)
        };
    }

    private topN<T>(items: T[], n: number): T[] {
        const counts = new Map<string, number>();
        items.forEach(item => {
            const key = String(item);
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([key]) => key as unknown as T);
    }

    private getDefaultPatterns(category: WorkCategory): PatternInsights {
        return {
            category,
            totalAnalyzed: 0,
            avgDeadlineDays: 7,
            stdDevDays: 2,
            avgHours: 8,
            stdDevHours: 4,
            estimateAccuracy: 85,
            earlyCompletionRate: 10,
            lateCompletionRate: 5,
            commonKeywords: [],
            frequentApprovers: [],
            riskDistribution: { low: 80, medium: 15, high: 5 },
            lastUpdated: new Date().toISOString(),
            dataQuality: "low"
        };
    }
}
