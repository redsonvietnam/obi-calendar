import type ObsidianCalendarAgentPlugin from "./main";
import { Logger } from "./Logger";

export interface VaultDailyNoteContext {
    date: string;
    path: string;
    preview: string;
}

export interface VaultTaskItem {
    path: string;
    line: number;
    text: string;
    completed: boolean;
}

export interface VaultProjectNoteContext {
    path: string;
    title: string;
    preview: string;
}

export interface VaultContextSnapshot {
    generatedAt: string;
    timezone: string;
    dailyNotes: VaultDailyNoteContext[];
    openTasks: VaultTaskItem[];
    projects: VaultProjectNoteContext[];
}

/**
 * Đọc context từ vault để bổ sung ngữ cảnh cho agent.
 * - Daily Notes: lấy theo thư mục Daily hoặc tên file dạng YYYY-MM-DD
 * - Tasks: parse markdown task list chưa hoàn thành
 * - Projects: lấy note trong folder project/projects (nếu có)
 */
export class VaultContext {
    private readonly plugin: ObsidianCalendarAgentPlugin;

    constructor(plugin: ObsidianCalendarAgentPlugin) {
        this.plugin = plugin;
    }

    async buildSnapshot(): Promise<VaultContextSnapshot> {
        const [dailyNotes, openTasks, projects] = await Promise.all([
            this.readDailyNotes(),
            this.readOpenTasks(),
            this.readProjects()
        ]);

        return {
            generatedAt: new Date().toISOString(),
            timezone: this.plugin.settings.timezone,
            dailyNotes,
            openTasks,
            projects
        };
    }

    private async readDailyNotes(): Promise<VaultDailyNoteContext[]> {
        const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
        const dailyNotesFolder = this.plugin.settings.dailyNotesFolder.toLowerCase();
        const candidates = markdownFiles.filter((file) => {
            const lowerPath = file.path.toLowerCase();
            const fileName = file.basename;
            const isInDailyFolder = dailyNotesFolder && lowerPath.startsWith(dailyNotesFolder + "/");
            const isDateName = /^\d{4}-\d{2}-\d{2}$/.test(fileName);
            return isInDailyFolder || isDateName;
        });

        const sorted = candidates
            .slice()
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, 5);

        const output: VaultDailyNoteContext[] = [];
        for (const file of sorted) {
            const content = await this.safeReadFile(file.path);
            output.push({
                date: file.basename,
                path: file.path,
                preview: this.toPreview(content, 280)
            });
        }

        return output;
    }

    private async readOpenTasks(): Promise<VaultTaskItem[]> {
        const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
        const result: VaultTaskItem[] = [];

        for (const file of markdownFiles) {
            const content = await this.safeReadFile(file.path);
            if (!content) continue;

            const lines = content.split(/\r?\n/);
            lines.forEach((line, index) => {
                const trimmed = line.trim();
                if (/^- \[ \] /.test(trimmed)) {
                    result.push({
                        path: file.path,
                        line: index + 1,
                        text: trimmed.replace(/^- \[ \] /, "").trim(),
                        completed: false
                    });
                }
            });

            if (result.length >= 50) break;
        }

        return result.slice(0, 50);
    }

    private async readProjects(): Promise<VaultProjectNoteContext[]> {
        const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
        const projectNotesFolder = this.plugin.settings.projectNotesFolder.toLowerCase();
        const projectCandidates = markdownFiles
            .filter((file) => {
                const lower = file.path.toLowerCase();
                return projectNotesFolder && lower.startsWith(projectNotesFolder + "/");
            })
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, 10);

        const output: VaultProjectNoteContext[] = [];
        for (const file of projectCandidates) {
            const content = await this.safeReadFile(file.path);
            output.push({
                path: file.path,
                title: file.basename,
                preview: this.toPreview(content, 260)
            });
        }

        return output;
    }

    private async safeReadFile(path: string): Promise<string> {
        try {
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (!file) return "";
            // `read` yêu cầu TFile, ở đây cast an toàn vì path lấy từ getMarkdownFiles()
            return await this.plugin.app.vault.cachedRead(file as never);
        } catch (error) {
            Logger.error("VaultContext", "read file failed", error);
            return "";
        }
    }

    private toPreview(content: string, maxChars: number): string {
        if (!content) return "";
        const oneLine = content.replace(/\s+/g, " ").trim();
        if (oneLine.length <= maxChars) return oneLine;
        return `${oneLine.slice(0, maxChars)}...`;
    }
}