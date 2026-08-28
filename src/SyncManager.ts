import { TFile, Notice } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { GoogleTasksAPI } from "./GoogleTasksAPI";
import { GoogleCalendarAPI } from "./GoogleCalendarAPI";
import { Logger } from "./Logger";

/**
 * SyncManager handles the bidirectional synchronization between Google services and Obsidian.
 * Focus: Google <-> Obsidian.
 */
export class SyncManager {
    private plugin: ObsidianCalendarAgentPlugin;
    private googleTasksApi: GoogleTasksAPI;
    private googleCalendarApi: GoogleCalendarAPI;
    private syncTimer?: number;
    private fileModifyListener?: (file: any) => Promise<void>; // To store the listener for unregistration
    private internalWrites: Map<string, number> = new Map();

    constructor(plugin: ObsidianCalendarAgentPlugin, googleTasksApi: GoogleTasksAPI, googleCalendarApi: GoogleCalendarAPI) {
        this.plugin = plugin;
        this.googleTasksApi = googleTasksApi;
        this.googleCalendarApi = googleCalendarApi;
    }

    /**
     * Initializes the sync manager, including listeners and auto-sync.
     */
    public initialize(): void {
        this.registerFileModificationListener();
        this.startAutoSync();
    }

    /**
     * Registers the listener for file modifications to sync Obsidian tasks to Google.
     * Suppression: ignores events for files currently under internal Google→Obsidian write.
     */
    private registerFileModificationListener(): void {
        // Ensure listener is not already registered
        if (this.fileModifyListener) {
            this.plugin.app.vault.off("modify", this.fileModifyListener as any);
        }

        this.fileModifyListener = async (file: any) => {
            // Only process markdown files
            if (file && file.extension === "md") {
                if (this.isInternalWrite(file.path as string)) {
                    Logger.debug("SyncManager", `Ignoring internal write for ${file.path}`);
                    return;
                }
                try {
                    await this.syncObsidianTasksToGoogle(file as TFile);
                } catch (error) {
                    Logger.error("SyncManager", `Error syncing Obsidian task from file ${file.path}`, error);
                }
            }
        };
        this.plugin.app.vault.on("modify", this.fileModifyListener as any);
        Logger.info("SyncManager", "File modification listener registered.");
    }

    private beginInternalWrite(path: string): void {
        const count = this.internalWrites.get(path) ?? 0;
        this.internalWrites.set(path, count + 1);
    }

    private endInternalWrite(path: string): void {
        const count = this.internalWrites.get(path);
        if (count === undefined) return;
        if (count <= 1) {
            this.internalWrites.delete(path);
        } else {
            this.internalWrites.set(path, count - 1);
        }
    }

    private isInternalWrite(path: string): boolean {
        return this.internalWrites.has(path);
    }

    /** Visible for testing – returns current suppression count for a path. */
    public getInternalWriteCount(path: string): number {
        return this.internalWrites.get(path) ?? 0;
    }

    private async withInternalWrite<T>(path: string, fn: () => Promise<T>): Promise<T> {
        this.beginInternalWrite(path);
        try {
            return await fn();
        } finally {
            this.endInternalWrite(path);
        }
    }

    /**
     * Starts the automatic synchronization timer based on plugin settings.
     */
    startAutoSync(): void {
        this.stopAutoSync();
        if (!this.plugin.settings.sync.enabled) return;

        const interval = this.plugin.settings.sync.intervalMinutes * 60 * 1000;
        this.syncTimer = window.setInterval(async () => {
            try {
                // This syncAll will handle Google -> Obsidian sync
                await this.syncAll();
            } catch (error) {
                Logger.error("SyncManager", "Auto-sync (Google -> Obsidian) failed", error);
            }
        }, interval);
        Logger.info("SyncManager", `Auto-sync started every ${this.plugin.settings.sync.intervalMinutes} minutes`);
    }

    /**
     * Stops the automatic synchronization timer and unregisters listeners.
     */
    stop(): void {
        this.stopAutoSync();
        if (this.fileModifyListener) {
            this.plugin.app.vault.off("modify", this.fileModifyListener as any);
            this.fileModifyListener = undefined;
            Logger.info("SyncManager", "File modification listener unregistered.");
        }
    }

    /**
     * Stops the automatic synchronization timer.
     */
    stopAutoSync(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = undefined;
        }
    }

    /**
     * Performs a full synchronization of all enabled services.
     * This primarily handles Google -> Obsidian sync.
     * Obsidian -> Google sync is handled by the file modification listener.
     */
    async syncAll(): Promise<{ tasksUpdated: number; calendarUpdated: number; errors: string[] }> {
        Logger.info("SyncManager", "Starting full sync (Google -> Obsidian)...");
        const results = {
            tasksUpdated: 0, // Google -> Obsidian tasks
            calendarUpdated: 0,
            errors: [] as string[]
        };

        if (this.plugin.settings.sync.syncTasks) {
            try {
                results.tasksUpdated = await this.syncTasks(); // Google -> Obsidian
            } catch (e) {
                results.errors.push(`Tasks sync (Google -> Obsidian) failed: ${(e as Error).message}`);
            }
        }

        if (this.plugin.settings.sync.syncCalendar) {
            try {
                results.calendarUpdated = await this.syncCalendar(); // Google Calendar -> Obsidian Daily Note
            } catch (e) {
                results.errors.push(`Calendar sync (Google -> Obsidian) failed: ${(e as Error).message}`);
            }
        }

        if (results.errors.length > 0) {
            Logger.error("SyncManager", "Sync completed with errors:", results.errors);
        } else {
            Logger.info("SyncManager", `Sync completed. Tasks updated: ${results.tasksUpdated}, Calendar updated: ${results.calendarUpdated}`);
        }

        return results;
    }

    /**
     * Synchronizes Google Tasks status back to Obsidian.
     * Looks for tasks marked with ^gtask-ID.
     */
    private async syncTasks(): Promise<number> {
        const lists = await this.googleTasksApi.listTaskLists();
        let totalUpdated = 0;

        for (const list of lists) {
            const tasks = await this.googleTasksApi.listTasks({ tasklist: list.id });

            for (const task of tasks) {
                if (!task.id) continue;

                const taskIdTag = `^gtask-${task.id}`;
                const files = this.plugin.app.vault.getMarkdownFiles();

                for (const file of files) {
                    const content = await this.plugin.app.vault.read(file);
                    if (content.includes(taskIdTag)) {
                        const isCompletedInGoogle = task.status === "completed";
                        const lines = content.split('\n');
                        let modified = false;

                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].includes(taskIdTag)) {
                                const line = lines[i];
                                // Check if it's a task line and if status differs
                                if (line.trim().startsWith('- [') || line.trim().startsWith('* [') || line.trim().startsWith('+ [')) {
                                    const currentStatusInObsidian = line.includes('[x]') ? 'completed' : 'needsAction';

                                    if (currentStatusInObsidian !== task.status) {
                                        const newStatus = isCompletedInGoogle ? '[x]' : '[ ]';
                                        lines[i] = line.replace(/\[.\]/, newStatus);
                                        modified = true;
                                    }
                                }
                            }
                        }

                        if (modified) {
                            await this.withInternalWrite(file.path, async () => {
                                await this.plugin.app.vault.modify(file, lines.join('\n'));
                            });
                            totalUpdated++;
                        }
                    }
                }
            }
        }
        return totalUpdated;
    }

    /**
     * Synchronizes Google Calendar events to the current Daily Note.
     */
    private async syncCalendar(): Promise<number> {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const dailyNotePath = `${this.plugin.settings.dailyNotesFolder}/${today}.md`;

        let file: TFile | null = this.plugin.app.vault.getAbstractFileByPath(dailyNotePath) as TFile;
        if (!file || !(file instanceof TFile)) {
            Logger.debug("SyncManager", `Daily note not found for today: ${dailyNotePath}. Attempting to create it.`);
            try {
                // Ensure the parent directory exists before creating the file
                const folderPath = this.plugin.settings.dailyNotesFolder;
                if (folderPath) {
                    // createFolder is idempotent, won't throw if folder exists
                    await this.plugin.app.vault.createFolder(folderPath);
                }
                file = await this.plugin.app.vault.create(dailyNotePath, "");
                new Notice(`Đã tạo ghi chú hàng ngày cho hôm nay: ${dailyNotePath}`);
            } catch (error) {
                Logger.error("SyncManager", `Failed to create daily note ${dailyNotePath}`, error);
                new Notice(`Không thể tạo ghi chú hàng ngày: ${dailyNotePath}. Vui lòng kiểm tra quyền hoặc đường dẫn thư mục.`);
                return 0;
            }
        }

        const events = await this.googleCalendarApi.listEvents({
            timeMin: `${today}T00:00:00Z`,
            timeMax: `${today}T23:59:59Z`,
            singleEvents: true
        });

        if (events.length === 0) return 0;

        const content = await this.plugin.app.vault.read(file);

        // Create a summary section for events
        let eventsSection = `\n## 📅 Google Calendar Events\n`;
        for (const event of events) {
            const start = event.start?.dateTime
                ? new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : "All day";
            eventsSection += `- [ ] ${start} ${event.summary}\n`;
        }

        // If the section already exists, replace it. Otherwise, append it.
        const sectionMarker = `## 📅 Google Calendar Events`;
        if (content.includes(sectionMarker)) {
            const regex = new RegExp(`${sectionMarker}[\\s\\S]*?(?=\\n##|$)`, 'g');
            const newContent = content.replace(regex, eventsSection.trim());
            if (newContent !== content) {
                await this.withInternalWrite(file.path, async () => {
                    await this.plugin.app.vault.modify(file, newContent);
                });
                return 1;
            }
            return 0;
        } else {
            await this.withInternalWrite(file.path, async () => {
                await this.plugin.app.vault.modify(file, content + '\n' + eventsSection);
            });
            return 1;
        }
    }

    /**
     * Synchronizes Obsidian tasks to Google Tasks.
     * Listens for file modifications and updates Google Tasks accordingly.
     */
    private async syncObsidianTasksToGoogle(file: TFile): Promise<number> {
        const content = await this.plugin.app.vault.read(file);
        const lines = content.split('\n');
        let updatedCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const taskTagMatch = line.match(/\^gtask-([a-zA-Z0-9_-]+)/);

            if (taskTagMatch) {
                const taskId = taskTagMatch[1];
                const isCompletedInObsidian = line.includes('[x]');
                const needsActionInObsidian = line.includes('[ ]');

                if (isCompletedInObsidian || needsActionInObsidian) {
                    try {
                        // Fetch the current task status from Google Tasks to avoid unnecessary updates
                        // Assuming default tasklist for now. This might need to be configurable.
                        const task = await this.googleTasksApi.getTask("@default", taskId);

                        if (task) {
                            const googleStatus = task.status; // 'completed' or 'needsAction'

                            if (isCompletedInObsidian && googleStatus !== 'completed') {
                                await this.googleTasksApi.patchTask("@default", taskId, {
                                    status: 'completed'
                                });
                                updatedCount++;
                                Logger.debug("SyncManager", `Marked Google Task ${taskId} as completed.`);
                            } else if (needsActionInObsidian && googleStatus !== 'needsAction') {
                                await this.googleTasksApi.patchTask("@default", taskId, {
                                    status: 'needsAction'
                                });
                                updatedCount++;
                                Logger.debug("SyncManager", `Marked Google Task ${taskId} as needsAction.`);
                            }
                        }
                    } catch (error) {
                        Logger.error("SyncManager", `Failed to update Google Task ${taskId} for file ${file.path}`, error);
                        // Optionally add error to a results array if needed
                    }
                }
            }
        }
        return updatedCount;
    }
}
