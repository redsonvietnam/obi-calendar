import { DEFAULT_TIMEZONE } from "./types";
/**
 * Tool registry cho Gemini function calling.
 * Session 3 tập trung vào CRUD calendar trực tiếp qua REST wrapper.
 */
export class CalendarTools {
    constructor(deps) {
        this.plugin = deps.plugin;
        this.calendarApi = deps.calendarApi;
        this.vaultContext = deps.vaultContext;
        this.safetyLayer = deps.safetyLayer;
        this.executors = {
            list_events: this.execListEvents.bind(this),
            create_event: this.execCreateEvent.bind(this),
            update_event: this.execUpdateEvent.bind(this),
            delete_event: this.execDeleteEvent.bind(this),
            get_vault_context: this.execGetVaultContext.bind(this)
        };
    }
    /**
     * Định nghĩa tools theo schema Gemini function calling.
     */
    getGeminiToolDeclarations() {
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
            }
        ];
    }
    async executeTool(call) {
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
        }
        catch (error) {
            console.error("[CalendarTools] executeTool failed", error);
            return {
                ok: false,
                error: error.message
            };
        }
    }
    async execListEvents(args) {
        const params = {
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
    async execCreateEvent(args) {
        const summary = this.asRequiredString(args.summary, "summary");
        const startDateTime = this.asRequiredString(args.startDateTime, "startDateTime");
        const endDateTime = this.asRequiredString(args.endDateTime, "endDateTime");
        const calendarId = this.asOptionalString(args.calendarId) ?? "primary";
        const timeZone = this.asOptionalString(args.timeZone) ?? this.getTimezone();
        const event = {
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
                    await this.calendarApi.deleteEvent(calendarId, created.id);
                }
            });
        }
        return created;
    }
    async execUpdateEvent(args) {
        const calendarId = this.asOptionalString(args.calendarId) ?? "primary";
        const eventId = this.asRequiredString(args.eventId, "eventId");
        const timeZone = this.asOptionalString(args.timeZone) ?? this.getTimezone();
        const existing = await this.calendarApi.getEvent(calendarId, eventId);
        const merged = {
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
    async execDeleteEvent(args) {
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
                const payload = {
                    ...existing
                };
                delete payload.id;
                await this.calendarApi.createEvent(calendarId, payload);
            }
        });
        return { deleted: true, calendarId, eventId };
    }
    async execGetVaultContext() {
        return await this.vaultContext.buildSnapshot();
    }
    buildSafetyDetails(calendarId, event) {
        const details = [];
        details.push(`calendarId: ${calendarId}`);
        if (event.summary)
            details.push(`summary: ${event.summary}`);
        if (event.start?.dateTime || event.start?.date) {
            details.push(`start: ${event.start.dateTime ?? event.start.date}`);
        }
        if (event.end?.dateTime || event.end?.date) {
            details.push(`end: ${event.end.dateTime ?? event.end.date}`);
        }
        if (event.location)
            details.push(`location: ${event.location}`);
        if (event.description)
            details.push(`description: ${this.truncate(event.description, 120)}`);
        return details;
    }
    truncate(text, max = 120) {
        if (text.length <= max)
            return text;
        return `${text.slice(0, max)}...`;
    }
    getTimezone() {
        return this.plugin.settings.timezone?.trim() || DEFAULT_TIMEZONE;
    }
    asOptionalString(value) {
        if (typeof value !== "string")
            return undefined;
        const v = value.trim();
        return v.length > 0 ? v : undefined;
    }
    asRequiredString(value, field) {
        const parsed = this.asOptionalString(value);
        if (!parsed) {
            throw new Error(`Thiếu tham số bắt buộc: ${field}`);
        }
        return parsed;
    }
    asOptionalNumber(value) {
        if (typeof value === "number" && Number.isFinite(value))
            return value;
        if (typeof value === "string" && value.trim().length > 0) {
            const n = Number(value);
            if (Number.isFinite(n))
                return n;
        }
        return undefined;
    }
}
