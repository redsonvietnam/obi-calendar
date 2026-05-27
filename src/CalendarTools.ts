import { normalizePath, TFile } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { GoogleCalendarAPI, ListEventsParams } from "./GoogleCalendarAPI";
import { DEFAULT_TIMEZONE, GoogleCalendarEvent } from "./types";
import { VaultContext } from "./VaultContext";
import { SafetyLayer } from "./SafetyLayer";

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
    name: string;
    arguments: Record<string, unknown>;
}

export interface ToolExecutionResult {
    ok: boolean;
    data?: unknown;
    error?: string;
}

export interface CalendarToolsDependencies {
    plugin: ObsidianCalendarAgentPlugin;
    calendarApi: GoogleCalendarAPI;
    vaultContext: VaultContext;
    safetyLayer: SafetyLayer;
}

type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Tool registry cho Gemini function calling.
 * Session 3 tập trung vào CRUD calendar trực tiếp qua REST wrapper.
 */
export class CalendarTools {
    private readonly plugin: ObsidianCalendarAgentPlugin;
    private readonly calendarApi: GoogleCalendarAPI;
    private readonly vaultContext: VaultContext;
    private readonly safetyLayer: SafetyLayer;
    private readonly executors: Record<string, ToolExecutor>;

    constructor(deps: CalendarToolsDependencies) {
        this.plugin = deps.plugin;
        this.calendarApi = deps.calendarApi;
        this.vaultContext = deps.vaultContext;
        this.safetyLayer = deps.safetyLayer;

        this.executors = {
            list_events: this.execListEvents.bind(this),
            create_event: this.execCreateEvent.bind(this),
            update_event: this.execUpdateEvent.bind(this),
            delete_event: this.execDeleteEvent.bind(this),
            get_vault_context: this.execGetVaultContext.bind(this),
            write_vault_note: this.execWriteVaultNote.bind(this),
            append_vault_note: this.execAppendVaultNote.bind(this)
        };
    }

    /**
     * Định nghĩa tools theo schema Gemini function calling.
     */
    getGeminiToolDeclarations(): ToolDefinition[] {
        return [
            {
                name: "list_events",
                description: "Liệt kê các sự kiện trên Google Calendar",
                parameters: {
                    type: "object",
                    properties: {
                        calendarId: {
                            type: "string",
                            description: "Calendar ID. Mặc định là primary"
                        },
                        timeMin: {
                            type: "string",
                            description: "Thời gian bắt đầu lọc (RFC3339)"
                        },
                        timeMax: {
                            type: "string",
                            description: "Thời gian kết thúc lọc (RFC3339)"
                        },
                        maxResults: {
                            type: "number",
                            description: "Số lượng sự kiện tối đa"
                        },
                        q: {
                            type: "string",
                            description: "Từ khóa tìm kiếm"
                        }
                    },
                    required: []
                }
            },
            {
                name: "create_event",
                description: "Tạo sự kiện mới trên Google Calendar",
                parameters: {
                    type: "object",
                    properties: {
                        calendarId: { type: "string" },
                        summary: { type: "string" },
                        description: { type: "string" },
                        location: { type: "string" },
                        startDateTime: {
                            type: "string",
                            description: "RFC3339, ví dụ 2026-05-25T09:00:00+07:00"
                        },
                        endDateTime: {
                            type: "string",
                            description: "RFC3339, ví dụ 2026-05-25T10:00:00+07:00"
                        },
                        timeZone: {
                            type: "string",
                            description: "IANA timezone, mặc định Asia/Ho_Chi_Minh"
                        }
                    },
                    required: ["summary", "startDateTime", "endDateTime"]
                }
            },
            {
                name: "update_event",
                description: "Cập nhật sự kiện đã có trên Google Calendar",
                parameters: {
                    type: "object",
                    properties: {
                        calendarId: { type: "string" },
                        eventId: { type: "string" },
                        summary: { type: "string" },
                        description: { type: "string" },
                        location: { type: "string" },
                        startDateTime: { type: "string" },
                        endDateTime: { type: "string" },
                        timeZone: { type: "string" }
                    },
                    required: ["eventId"]
                }
            },
            {
                name: "delete_event",
                description: "Xóa sự kiện trên Google Calendar",
                parameters: {
                    type: "object",
                    properties: {
                        calendarId: { type: "string" },
                        eventId: { type: "string" }
                    },
                    required: ["eventId"]
                }
            },
            {
                name: "get_vault_context",
                description: "Đọc ngữ cảnh từ Obsidian vault (daily notes, tasks, projects)",
                parameters: {
                    type: "object",
                    properties: {},
                    required: []
                }
            },
            {
                name: "write_vault_note",
                description: "Ghi đè hoặc tạo mới một ghi chú trong Obsidian vault với nội dung chỉ định",
                parameters: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "Đường dẫn tương đối của file trong vault, ví dụ 'Daily/2026-05-27.md'"
                        },
                        content: {
                            type: "string",
                            description: "Nội dung markdown đầy đủ của file"
                        }
                    },
                    required: ["path", "content"]
                }
            },
            {
                name: "append_vault_note",
                description: "Thêm nội dung vào cuối một ghi chú đã có trong Obsidian vault",
                parameters: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "Đường dẫn tương đối của file trong vault"
                        },
                        contentToAppend: {
                            type: "string",
                            description: "Nội dung cần chèn thêm vào cuối ghi chú"
                        }
                    },
                    required: ["path", "contentToAppend"]
                }
            }
        ];
    }

    async executeTool(call: ToolCallRequest): Promise<ToolExecutionResult> {
        try {
            const toolName = call.name?.trim();
            if (!toolName) {
                throw new Error("Thiếu tên tool.");
            }

            const executor = this.executors[toolName];
            if (!executor) {
                throw new Error(`Tool không tồn tại: ${toolName}`);
            }

            const data = await executor(call.arguments ?? {});
            return { ok: true, data };
        } catch (error) {
            console.error("[CalendarTools] executeTool failed", error);
            return {
                ok: false,
                error: (error as Error).message
            };
        }
    }

    private async execListEvents(args: Record<string, unknown>): Promise<unknown> {
        const params: ListEventsParams = {
            calendarId: this.asOptionalString(args.calendarId) ?? "primary",
            timeMin: this.asOptionalString(args.timeMin),
            timeMax: this.asOptionalString(args.timeMax),
            maxResults: this.asOptionalNumber(args.maxResults) ?? 20,
            q: this.asOptionalString(args.q),
            singleEvents: true,
            orderBy: "startTime",
            timeZone: this.asOptionalString(args.timeZone) ?? this.getTimezone()
        };

        const events = await this.calendarApi.listEvents(params);
        return {
            timezone: params.timeZone,
            total: events.length,
            events
        };
    }

    private async execCreateEvent(args: Record<string, unknown>): Promise<unknown> {
        const summary = this.asRequiredString(args.summary, "summary");
        const startDateTime = this.asRequiredString(args.startDateTime, "startDateTime");
        const endDateTime = this.asRequiredString(args.endDateTime, "endDateTime");
        const calendarId = this.asOptionalString(args.calendarId) ?? "primary";
        const timeZone = this.asOptionalString(args.timeZone) ?? this.getTimezone();

        const event: GoogleCalendarEvent = {
            summary,
            description: this.asOptionalString(args.description),
            location: this.asOptionalString(args.location),
            start: {
                dateTime: startDateTime,
                timeZone
            },
            end: {
                dateTime: endDateTime,
                timeZone
            }
        };

        const accepted = await this.safetyLayer.confirm({
            action: "create_event",
            summary: `Tạo sự kiện mới: ${summary}`,
            details: this.buildSafetyDetails(calendarId, event)
        });
        if (!accepted) {
            throw new Error("Người dùng từ chối tạo sự kiện.");
        }

        const created = await this.calendarApi.createEvent(calendarId, event);

        if (created.id) {
            this.safetyLayer.registerUndo({
                id: `undo-create-${created.id}-${Date.now()}`,
                label: `Hoàn tác tạo event ${created.summary ?? created.id}`,
                createdAt: new Date().toISOString(),
                rollback: async () => {
                    await this.calendarApi.deleteEvent(calendarId, created.id as string);
                }
            });
        }

        return created;
    }

    private async execUpdateEvent(args: Record<string, unknown>): Promise<unknown> {
        const calendarId = this.asOptionalString(args.calendarId) ?? "primary";
        const eventId = this.asRequiredString(args.eventId, "eventId");
        const timeZone = this.asOptionalString(args.timeZone) ?? this.getTimezone();

        const existing = await this.calendarApi.getEvent(calendarId, eventId);

        const merged: GoogleCalendarEvent = {
            ...existing,
            summary: this.asOptionalString(args.summary) ?? existing.summary,
            description: this.asOptionalString(args.description) ?? existing.description,
            location: this.asOptionalString(args.location) ?? existing.location,
            start: {
                ...existing.start,
                dateTime: this.asOptionalString(args.startDateTime) ?? existing.start?.dateTime,
                timeZone
            },
            end: {
                ...existing.end,
                dateTime: this.asOptionalString(args.endDateTime) ?? existing.end?.dateTime,
                timeZone
            }
        };

        const accepted = await this.safetyLayer.confirm({
            action: "update_event",
            summary: `Cập nhật sự kiện: ${existing.summary ?? eventId}`,
            details: this.buildSafetyDetails(calendarId, merged)
        });
        if (!accepted) {
            throw new Error("Người dùng từ chối cập nhật sự kiện.");
        }

        const updated = await this.calendarApi.updateEvent(calendarId, eventId, merged);

        this.safetyLayer.registerUndo({
            id: `undo-update-${eventId}-${Date.now()}`,
            label: `Hoàn tác cập nhật event ${existing.summary ?? eventId}`,
            createdAt: new Date().toISOString(),
            rollback: async () => {
                await this.calendarApi.updateEvent(calendarId, eventId, existing);
            }
        });

        return updated;
    }

    private async execDeleteEvent(args: Record<string, unknown>): Promise<unknown> {
        const calendarId = this.asOptionalString(args.calendarId) ?? "primary";
        const eventId = this.asRequiredString(args.eventId, "eventId");
        const existing = await this.calendarApi.getEvent(calendarId, eventId);

        const accepted = await this.safetyLayer.confirm({
            action: "delete_event",
            summary: `Xóa sự kiện: ${existing.summary ?? eventId}`,
            details: this.buildSafetyDetails(calendarId, existing)
        });
        if (!accepted) {
            throw new Error("Người dùng từ chối xóa sự kiện.");
        }

        await this.calendarApi.deleteEvent(calendarId, eventId);

        this.safetyLayer.registerUndo({
            id: `undo-delete-${eventId}-${Date.now()}`,
            label: `Hoàn tác xóa event ${existing.summary ?? eventId}`,
            createdAt: new Date().toISOString(),
            rollback: async () => {
                const payload: GoogleCalendarEvent = {
                    ...existing
                };
                delete payload.id;
                await this.calendarApi.createEvent(calendarId, payload);
            }
        });

        return { deleted: true, calendarId, eventId };
    }

    private async execGetVaultContext(): Promise<unknown> {
        return await this.vaultContext.buildSnapshot();
    }

    private async execWriteVaultNote(args: Record<string, unknown>): Promise<unknown> {
        const path = this.asRequiredString(args.path, "path");
        const content = this.asRequiredString(args.content, "content");

        const accepted = await this.safetyLayer.confirm({
            action: "write_note",
            summary: `Ghi đè hoặc tạo ghi chú: ${path}`,
            details: [`Đường dẫn: ${path}`, `Nội dung (rút gọn): ${this.truncate(content, 150)}`]
        });
        if (!accepted) {
            throw new Error("Người dùng từ chối ghi ghi chú.");
        }

        const normalized = normalizePath(path);
        const file = this.plugin.app.vault.getAbstractFileByPath(normalized);

        let oldContent = "";
        let isNew = true;

        if (file instanceof TFile) {
            oldContent = await this.plugin.app.vault.read(file);
            isNew = false;
            await this.plugin.app.vault.modify(file, content);
        } else {
            // Tự động tạo thư mục nếu chưa tồn tại
            const parts = normalized.split("/");
            if (parts.length > 1) {
                const folderPath = parts.slice(0, -1).join("/");
                if (!this.plugin.app.vault.getAbstractFileByPath(folderPath)) {
                    await this.plugin.app.vault.createFolder(folderPath);
                }
            }
            await this.plugin.app.vault.create(normalized, content);
        }

        this.safetyLayer.registerUndo({
            id: `undo-write-note-${normalized}-${Date.now()}`,
            label: `Hoàn tác ghi file ${path}`,
            createdAt: new Date().toISOString(),
            rollback: async () => {
                const f = this.plugin.app.vault.getAbstractFileByPath(normalized);
                if (f instanceof TFile) {
                    if (isNew) {
                        await this.plugin.app.vault.delete(f);
                    } else {
                        await this.plugin.app.vault.modify(f, oldContent);
                    }
                }
            }
        });

        return { success: true, path: normalized, isNew };
    }

    private async execAppendVaultNote(args: Record<string, unknown>): Promise<unknown> {
        const path = this.asRequiredString(args.path, "path");
        const contentToAppend = this.asRequiredString(args.contentToAppend, "contentToAppend");

        const accepted = await this.safetyLayer.confirm({
            action: "write_note",
            summary: `Thêm nội dung vào ghi chú: ${path}`,
            details: [`Đường dẫn: ${path}`, `Nội dung thêm (rút gọn): ${this.truncate(contentToAppend, 150)}`]
        });
        if (!accepted) {
            throw new Error("Người dùng từ chối thêm nội dung ghi chú.");
        }

        const normalized = normalizePath(path);
        const file = this.plugin.app.vault.getAbstractFileByPath(normalized);

        let oldContent = "";
        let isNew = true;

        if (file instanceof TFile) {
            oldContent = await this.plugin.app.vault.read(file);
            isNew = false;
            const separator = oldContent.endsWith("\n") || oldContent.length === 0 ? "" : "\n";
            await this.plugin.app.vault.modify(file, oldContent + separator + contentToAppend);
        } else {
            const parts = normalized.split("/");
            if (parts.length > 1) {
                const folderPath = parts.slice(0, -1).join("/");
                if (!this.plugin.app.vault.getAbstractFileByPath(folderPath)) {
                    await this.plugin.app.vault.createFolder(folderPath);
                }
            }
            await this.plugin.app.vault.create(normalized, contentToAppend);
        }

        this.safetyLayer.registerUndo({
            id: `undo-append-note-${normalized}-${Date.now()}`,
            label: `Hoàn tác thêm nội dung file ${path}`,
            createdAt: new Date().toISOString(),
            rollback: async () => {
                const f = this.plugin.app.vault.getAbstractFileByPath(normalized);
                if (f instanceof TFile) {
                    if (isNew) {
                        await this.plugin.app.vault.delete(f);
                    } else {
                        await this.plugin.app.vault.modify(f, oldContent);
                    }
                }
            }
        });

        return { success: true, path: normalized, isNew };
    }

    private buildSafetyDetails(calendarId: string, event: Partial<GoogleCalendarEvent>): string[] {
        const details: string[] = [];
        details.push(`calendarId: ${calendarId}`);
        if (event.summary) details.push(`summary: ${event.summary}`);
        if (event.start?.dateTime || event.start?.date) {
            details.push(`start: ${event.start.dateTime ?? event.start.date}`);
        }
        if (event.end?.dateTime || event.end?.date) {
            details.push(`end: ${event.end.dateTime ?? event.end.date}`);
        }
        if (event.location) details.push(`location: ${event.location}`);
        if (event.description) details.push(`description: ${this.truncate(event.description, 120)}`);
        return details;
    }

    private truncate(text: string, max = 120): string {
        if (text.length <= max) return text;
        return `${text.slice(0, max)}...`;
    }

    private getTimezone(): string {
        return this.plugin.settings.timezone?.trim() || DEFAULT_TIMEZONE;
    }

    private asOptionalString(value: unknown): string | undefined {
        if (typeof value !== "string") return undefined;
        const v = value.trim();
        return v.length > 0 ? v : undefined;
    }

    private asRequiredString(value: unknown, field: string): string {
        const parsed = this.asOptionalString(value);
        if (!parsed) {
            throw new Error(`Thiếu tham số bắt buộc: ${field}`);
        }
        return parsed;
    }

    private asOptionalNumber(value: unknown): number | undefined {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim().length > 0) {
            const n = Number(value);
            if (Number.isFinite(n)) return n;
        }
        return undefined;
    }
}