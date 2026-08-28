import { TFile, Notice } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { GoogleTasksAPI } from "./GoogleTasksAPI";
import { GoogleCalendarAPI } from "./GoogleCalendarAPI";
import { Logger } from "./Logger";
import { DEFAULT_TIMEZONE } from "./types";

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

    // --- Timezone helpers (no hard-coded zone, uses configured/default) ---
    private getTimezone(): string {
        const tz = this.plugin.settings.timezone?.trim();
        return tz || DEFAULT_TIMEZONE;
    }

    private getLocalDateString(date: Date): string {
        // en-CA gives YYYY-MM-DD in target timezone
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: this.getTimezone(),
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(date);
    }

    private getLocalTodayString(): string {
        return this.getLocalDateString(new Date());
    }

    /**
     * Convert a wall time (localDate + 00:00:00) in configured timezone to UTC ISO.
     * Iterative adjustment via Intl to handle arbitrary zones/DST without external lib.
     */
    private wallTimeToUtcIso(localDate: string, time: string): string {
        const [y, m, d] = localDate.split("-").map(Number);
        const [hh, mm, ss] = time.split(":").map(Number);
        let utcMs = Date.UTC(y, m - 1, d, hh, mm, ss ?? 0);
        const tz = this.getTimezone();
        // Two iterations are enough for fixed-offset zones (Vietnam) and DST transitions
        for (let i = 0; i < 3; i++) {
            const fmt = new Intl.DateTimeFormat("en-CA", {
                timeZone: tz,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
            });
            const parts = fmt.formatToParts(new Date(utcMs));
            const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
            const wy = Number(get("year"));
            const wmo = Number(get("month"));
            const wd = Number(get("day"));
            const wh = Number(get("hour"));
            const wmi = Number(get("minute"));
            const ws = Number(get("second"));
            const wallMsAsUtc = Date.UTC(wy, wmo - 1, wd, wh, wmi, ws);
            const desiredMsAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss ?? 0);
            const diff = desiredMsAsUtc - wallMsAsUtc;
            if (diff === 0) break;
            utcMs += diff;
        }
        return new Date(utcMs).toISOString();
    }

    private getUtcBoundsForLocalDay(localDate: string): { timeMin: string; timeMax: string } {
        const timeMin = this.wallTimeToUtcIso(localDate, "00:00:00");
        // next local day at 00:00 is exclusive upper bound
        const [y, m, d] = localDate.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() + 1);
        const nextLocal = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
        const timeMax = this.wallTimeToUtcIso(nextLocal, "00:00:00");
        return { timeMin, timeMax };
    }

    /**
     * Determine calendar date for an event in configured timezone.
     * - All-day: use start.date directly (Google's date is calendar date, end is exclusive)
     * - Timed: convert start.dateTime instant to local date via Intl in configured TZ
     */
    public getEventLocalDate(event: { start?: { date?: string; dateTime?: string; timeZone?: string } }): string | null {
        if (!event.start) return null;
        if (event.start.date) return event.start.date;
        if (event.start.dateTime) {
            const d = new Date(event.start.dateTime);
            if (isNaN(d.getTime())) return null;
            return this.getLocalDateString(d);
        }
        return null;
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
     * Preserves task list identity: stores ^gtask-{listId}-{taskId}
     */
    private async syncTasks(): Promise<number> {
        const lists = await this.googleTasksApi.listTaskLists();
        let totalUpdated = 0;

        for (const list of lists) {
            const tasks = await this.googleTasksApi.listTasks({ tasklist: list.id });

            for (const task of tasks) {
                if (!task.id) continue;

                const taskIdTag = `^gtask~${list.id}~${task.id}`;
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
     * Parses a task tag and extracts list ID and task ID.
     * Returns null if tag format doesn't match (legacy or malformed).
     */
    public parseTaskTag(tag: string): { tasklistId: string; taskId: string } | null {
        // New format: ^gtask~{listId}~{taskId}
        const match = tag.match(/^\^gtask~([^~]+)~(.+)$/);
        if (!match) return null;
        return { tasklistId: match[1], taskId: match[2] };
    }

    /**
     * Finds legacy task ID from old format ^gtask-{taskId} for backward compatibility.
     */
    public extractLegacyTaskId(line: string): string | null {
        const match = line.match(/\^gtask-([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    /**
     * Synchronizes Google Calendar events to the current Daily Note.
     * Date boundary is determined in configured timezone (DEFAULT_TIMEZONE fallback),
     * and UTC bounds are derived from that local day to avoid UTC previous-day drift.
     */
    private async syncCalendar(): Promise<number> {
        const today = this.getLocalTodayString();
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

        const { timeMin, timeMax } = this.getUtcBoundsForLocalDay(today);
        const events = await this.googleCalendarApi.listEvents({
            timeMin,
            timeMax,
            singleEvents: true,
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
     * Uses preserved task list identity from task tag format.
     */
    private async syncObsidianTasksToGoogle(file: TFile): Promise<number> {
        const content = await this.plugin.app.vault.read(file);
        const lines = content.split('\n');
        let updatedCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
        const taskTagMatch = line.match(/\^gtask[~-][^\s]+/);

            if (taskTagMatch) {
                const fullTag = taskTagMatch[0];
                const parsed = this.parseTaskTag(fullTag);

                let listId: string;
                let taskId: string;

                if (parsed) {
                    listId = parsed.tasklistId;
                    taskId = parsed.taskId;
                } else {
                    // Legacy format: ^gtask-{taskId} without list ID
                    const legacyTaskId = this.extractLegacyTaskId(fullTag);
                    if (!legacyTaskId) continue;
                    listId = "@default";
                    taskId = legacyTaskId;
                }

                const isCompletedInObsidian = line.includes('[x]');
                const needsActionInObsidian = line.includes('[ ]');

                if (isCompletedInObsidian || needsActionInObsidian) {
                    try {
                        // Fetch the current task status from Google Tasks to avoid unnecessary updates
                        const task = await this.googleTasksApi.getTask(listId, taskId);

                        if (task) {
                            const googleStatus = task.status; // 'completed' or 'needsAction'

                            if (isCompletedInObsidian && googleStatus !== 'completed') {
                                await this.googleTasksApi.patchTask(listId, taskId, {
                                    status: 'completed'
                                });
                                updatedCount++;
                                Logger.debug("SyncManager", `Marked Google Task ${taskId} (list ${listId}) as completed.`);
                            } else if (needsActionInObsidian && googleStatus !== 'needsAction') {
                                await this.googleTasksApi.patchTask(listId, taskId, {
                                    status: 'needsAction'
                                });
                                updatedCount++;
                                Logger.debug("SyncManager", `Marked Google Task ${taskId} (list ${listId}) as needsAction.`);
                            }
                        }
                    } catch (error) {
                        Logger.error("SyncManager", `Failed to update Google Task ${taskId} (list ${listId}) for file ${file.path}`, error);
                        // Optionally add error to a results array if needed
                    }
                }
            }
        }
        return updatedCount;
    }
}
