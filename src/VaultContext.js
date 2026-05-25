/**
 * Đọc context từ vault để bổ sung ngữ cảnh cho agent.
 * - Daily Notes: lấy theo thư mục Daily hoặc tên file dạng YYYY-MM-DD
 * - Tasks: parse markdown task list chưa hoàn thành
 * - Projects: lấy note trong folder project/projects (nếu có)
 */
export class VaultContext {
    constructor(plugin) {
        this.plugin = plugin;
    }
    async buildSnapshot() {
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
    async readDailyNotes() {
        const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
        const candidates = markdownFiles.filter((file) => {
            const lowerPath = file.path.toLowerCase();
            const fileName = file.basename;
            const isDailyFolder = lowerPath.includes("daily");
            const isDateName = /^\d{4}-\d{2}-\d{2}$/.test(fileName);
            return isDailyFolder || isDateName;
        });
        const sorted = candidates
            .slice()
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, 5);
        const output = [];
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
    async readOpenTasks() {
        const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
        const result = [];
        for (const file of markdownFiles) {
            const content = await this.safeReadFile(file.path);
            if (!content)
                continue;
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
            if (result.length >= 50)
                break;
        }
        return result.slice(0, 50);
    }
    async readProjects() {
        const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
        const projectCandidates = markdownFiles
            .filter((file) => {
            const lower = file.path.toLowerCase();
            return lower.includes("project/") || lower.includes("projects/");
        })
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, 10);
        const output = [];
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
    async safeReadFile(path) {
        try {
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (!file)
                return "";
            // `read` yêu cầu TFile, ở đây cast an toàn vì path lấy từ getMarkdownFiles()
            return await this.plugin.app.vault.cachedRead(file);
        }
        catch (error) {
            console.error("[VaultContext] read file failed", path, error);
            return "";
        }
    }
    toPreview(content, maxChars) {
        if (!content)
            return "";
        const oneLine = content.replace(/\s+/g, " ").trim();
        if (oneLine.length <= maxChars)
            return oneLine;
        return `${oneLine.slice(0, maxChars)}...`;
    }
}
