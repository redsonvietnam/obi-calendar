import { normalizePath, TFile } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { GoogleCalendarAPI, ListEventsParams } from "./GoogleCalendarAPI";
import { GoogleTasksAPI, ListTaskListsParams, ListTasksParams } from "./GoogleTasksAPI"; // Import GoogleTasksAPI and its types
import { DEFAULT_TIMEZONE, GoogleCalendarEvent, GoogleTask, GoogleTaskList } from "./types"; // Import GoogleTask and GoogleTaskList
import { VaultContext } from "./VaultContext";
import { SafetyLayer } from "./SafetyLayer";
import { OAuthManager } from "./OAuthManager"; // Import OAuthManager

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

import { DocumentAnalyzer } from "./DocumentAnalyzer";

export interface CalendarToolsDependencies {
    plugin: ObsidianCalendarAgentPlugin;
    calendarApi: GoogleCalendarAPI;
    googleTasksApi: GoogleTasksAPI; // Add GoogleTasksAPI
    vaultContext: VaultContext;
    safetyLayer: SafetyLayer;
    oauthManager: OAuthManager; // Add OAuthManager for GoogleTasksAPI initialization
    documentAnalyzer?: DocumentAnalyzer;
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
    private readonly googleTasksApi: GoogleTasksAPI; // Add GoogleTasksAPI instance
    private readonly documentAnalyzer?: DocumentAnalyzer;
    private readonly executors: Record<string, ToolExecutor>;

    constructor(deps: CalendarToolsDependencies) {
        this.plugin = deps.plugin;
        this.calendarApi = deps.calendarApi;
        // Initialize GoogleTasksAPI with OAuthManager
        this.googleTasksApi = new GoogleTasksAPI(deps.plugin, deps.oauthManager);
        this.vaultContext = deps.vaultContext;
        this.safetyLayer = deps.safetyLayer;
        this.documentAnalyzer = deps.documentAnalyzer;

        this.executors = {
            list_events: this.execListEvents.bind(this),
            create_event: this.execCreateEvent.bind(this),
            update_event: this.execUpdateEvent.bind(this),
            delete_event: this.execDeleteEvent.bind(this),
            get_vault_context: this.execGetVaultContext.bind(this),
            write_vault_note: this.execWriteVaultNote.bind(this),
            append_vault_note: this.execAppendVaultNote.bind(this),
            // Google Tasks tools
            list_task_lists: this.execListTaskLists.bind(this),
            create_task_list: this.execCreateTaskList.bind(this),
            delete_task_list: this.execDeleteTaskList.bind(this),
            list_tasks: this.execListTasks.bind(this),
            create_task: this.execCreateTask.bind(this),
            update_task: this.execUpdateTask.bind(this),
            patch_task: this.execPatchTask.bind(this),
            delete_task: this.execDeleteTask.bind(this),
            // Document Analysis tools
            analyze_document_image: this.execAnalyzeDocumentImage.bind(this),
            create_task_from_analysis: this.execCreateTaskFromAnalysis.bind(this),
            create_event_from_analysis: this.execCreateEventFromAnalysis.bind(this)
        };
    }

    /**
     * Định nghĩa tools theo schema Gemini function calling.
     */
    getGeminiToolDeclarations(excludeTools?: string[]): ToolDefinition[] {
        let decls = [
            ...this.getCalendarToolDeclarations(),
            ...this.getGoogleTasksToolDeclarations(),
            ...this.getDocumentAnalysisToolDeclarations()
        ];
        if (excludeTools && excludeTools.length > 0) {
            decls = decls.filter(d => !excludeTools.includes(d.name));
        }
        return decls;
    }

    private getCalendarToolDeclarations(): ToolDefinition[] {
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
                        },
                        sourceNotePath: {
                            type: "string",
                            description: "Đường dẫn file Obsidian nguồn để tạo deep link"
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
                        timeZone: { type: "string" },
                        sourceNotePath: {
                            type: "string",
                            description: "Đường dẫn file Obsidian nguồn để cập nhật deep link"
                        }
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

    private getGoogleTasksToolDeclarations(): ToolDefinition[] {
        return [
            {
                name: "list_task_lists",
                description: "Liệt kê các danh sách task trên Google Tasks",
                parameters: {
                    type: "object",
                    properties: {
                        maxResults: { type: "number", description: "Số lượng danh sách task tối đa" }
                    },
                    required: []
                }
            },
            {
                name: "create_task_list",
                description: "Tạo một danh sách task mới trên Google Tasks",
                parameters: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Tiêu đề của danh sách task" }
                    },
                    required: ["title"]
                }
            },
            {
                name: "delete_task_list",
                description: "Xóa một danh sách task trên Google Tasks",
                parameters: {
                    type: "object",
                    properties: {
                        tasklistId: { type: "string", description: "ID của danh sách task cần xóa" }
                    },
                    required: ["tasklistId"]
                }
            },
            {
                name: "list_tasks",
                description: "Liệt kê các task trong một danh sách task trên Google Tasks",
                parameters: {
                    type: "object",
                    properties: {
                        tasklistId: { type: "string", description: "ID của danh sách task. Mặc định là 'default' hoặc danh sách chính." },
                        maxResults: { type: "number", description: "Số lượng task tối đa" },
                        showCompleted: { type: "boolean", description: "Bao gồm các task đã hoàn thành" },
                        showDeleted: { type: "boolean", description: "Bao gồm các task đã xóa" },
                        showHidden: { type: "boolean", description: "Bao gồm các task ẩn" },
                        sortBy: { type: "string", enum: ["newList", "due", "updated"], description: "Cách sắp xếp task" }
                    },
                    required: []
                }
            },
            {
                name: "create_task",
                description: "Tạo một task mới trong danh sách task trên Google Tasks",
                parameters: {
                    type: "object",
                    properties: {
                        tasklistId: { type: "string", description: "ID của danh sách task. Nếu bỏ trống sẽ dùng danh sách mặc định." },
                        title: { type: "string", description: "Tiêu đề của task" },
                        notes: { type: "string", description: "Ghi chú chi tiết cho task" },
                        due: { type: "string", description: "Ngày hết hạn của task (RFC3339)" },
                        sourceNotePath: {
                            type: "string",
                            description: "Đường dẫn file Obsidian nguồn để tạo deep link"
                        }
                    },
                    required: ["title"]
                }
            },
            {
                name: "update_task",
                description: "Cập nhật một task đã có trên Google Tasks (thay thế toàn bộ)",
                parameters: {
                    type: "object",
                    properties: {
                        tasklistId: { type: "string", description: "ID của danh sách task" },
                        taskId: { type: "string", description: "ID của task cần cập nhật" },
                        title: { type: "string", description: "Tiêu đề mới của task" },
                        notes: { type: "string", description: "Ghi chú mới cho task" },
                        due: { type: "string", description: "Ngày hết hạn mới của task (RFC3339)" },
                        status: { type: "string", enum: ["needsAction", "completed"], description: "Trạng thái của task" },
                        sourceNotePath: {
                            type: "string",
                            description: "Đường dẫn file Obsidian nguồn để cập nhật deep link"
                        }
                    },
                    required: ["tasklistId", "taskId"]
                }
            },
            {
                name: "patch_task",
                description: "Cập nhật một phần một task đã có trên Google Tasks",
                parameters: {
                    type: "object",
                    properties: {
                        tasklistId: { type: "string", description: "ID của danh sách task" },
                        taskId: { type: "string", description: "ID của task cần cập nhật" },
                        title: { type: "string", description: "Tiêu đề mới của task" },
                        notes: { type: "string", description: "Ghi chú mới cho task" },
                        due: { type: "string", description: "Ngày hết hạn mới của task (RFC3339)" },
                        status: { type: "string", enum: ["needsAction", "completed"], description: "Trạng thái của task" },
                        sourceNotePath: {
                            type: "string",
                            description: "Đường dẫn file Obsidian nguồn để cập nhật deep link"
                        }
                    },
                    required: ["tasklistId", "taskId"]
                }
            },
            {
                name: "delete_task",
                description: "Xóa một task trên Google Tasks",
                parameters: {
                    type: "object",
                    properties: {
                        tasklistId: { type: "string", description: "ID của danh sách task" },
                        taskId: { type: "string", description: "ID của task cần xóa" }
                    },
                    required: ["tasklistId", "taskId"]
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
        const sourceNotePath = this.asOptionalString(args.sourceNotePath);

        let description = this.asOptionalString(args.description);
        if (sourceNotePath) {
            const vaultName = this.plugin.app.vault.getName();
            const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(sourceNotePath)}`;
            description = (description ? description + "\n\n" : "") + `Source Note: ${uri}`;
        }

        const event: GoogleCalendarEvent = {
            summary,
            description,
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

        const sourceNotePath = this.asOptionalString(args.sourceNotePath);
        let description = this.asOptionalString(args.description) ?? existing.description;
        if (sourceNotePath) {
            const vaultName = this.plugin.app.vault.getName();
            const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(sourceNotePath)}`;
            if (!description?.includes(uri)) {
                description = (description ? description + "\n\n" : "") + `Source Note: ${uri}`;
            }
        }

        const merged: GoogleCalendarEvent = {
            ...existing,
            summary: this.asOptionalString(args.summary) ?? existing.summary,
            description,
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

    private async execListTaskLists(args: Record<string, unknown>): Promise<unknown> {
        const params: ListTaskListsParams = {
            maxResults: this.asOptionalNumber(args.maxResults)
        };
        return await this.googleTasksApi.listTaskLists(params);
    }

    private async execCreateTaskList(args: Record<string, unknown>): Promise<unknown> {
        const title = this.asRequiredString(args.title, "title");
        return await this.googleTasksApi.createTaskList(title);
    }

    private async execDeleteTaskList(args: Record<string, unknown>): Promise<unknown> {
        const tasklistId = this.asRequiredString(args.tasklistId, "tasklistId");
        await this.googleTasksApi.deleteTaskList(tasklistId);
        return { deleted: true, tasklistId };
    }

    private async execListTasks(args: Record<string, unknown>): Promise<unknown> {
        const params: ListTasksParams = {
            tasklist: this.asOptionalString(args.tasklistId) ?? "@default",
            maxResults: this.asOptionalNumber(args.maxResults),
            showCompleted: this.asOptionalBoolean(args.showCompleted),
            showDeleted: this.asOptionalBoolean(args.showDeleted),
            showHidden: this.asOptionalBoolean(args.showHidden),
            sortBy: this.asOptionalString(args.sortBy) as ListTasksParams["sortBy"]
        };
        return await this.googleTasksApi.listTasks(params);
    }

    private async execCreateTask(args: Record<string, unknown>): Promise<unknown> {
        const tasklistId = this.asOptionalString(args.tasklistId) ?? "@default";
        const sourceNotePath = this.asOptionalString(args.sourceNotePath);

        let notes = this.asOptionalString(args.notes);
        if (sourceNotePath) {
            const vaultName = this.plugin.app.vault.getName();
            const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(sourceNotePath)}`;
            notes = (notes ? notes + "\n\n" : "") + `Source Note: ${uri}`;
        }

        const task: Partial<GoogleTask> = {
            title: this.asRequiredString(args.title, "title"),
            notes,
            due: this.asOptionalString(args.due)
        };
        return await this.googleTasksApi.createTask(tasklistId, task);
    }

    private async execUpdateTask(args: Record<string, unknown>): Promise<unknown> {
        const tasklistId = this.asRequiredString(args.tasklistId, "tasklistId");
        const taskId = this.asRequiredString(args.taskId, "taskId");
        const sourceNotePath = this.asOptionalString(args.sourceNotePath);

        // We need to get the existing task to avoid duplicating the link
        const existing = await this.googleTasksApi.getTask(tasklistId, taskId);
        let notes = this.asOptionalString(args.notes) ?? existing.notes;
        if (sourceNotePath) {
            const vaultName = this.plugin.app.vault.getName();
            const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(sourceNotePath)}`;
            if (!notes?.includes(uri)) {
                notes = (notes ? notes + "\n\n" : "") + `Source Note: ${uri}`;
            }
        }

        const task: Partial<GoogleTask> = {
            title: this.asOptionalString(args.title),
            notes,
            due: this.asOptionalString(args.due),
            status: this.asOptionalString(args.status) as GoogleTask["status"]
        };
        return await this.googleTasksApi.updateTask(tasklistId, taskId, task);
    }

    private async execPatchTask(args: Record<string, unknown>): Promise<unknown> {
        const tasklistId = this.asRequiredString(args.tasklistId, "tasklistId");
        const taskId = this.asRequiredString(args.taskId, "taskId");
        const sourceNotePath = this.asOptionalString(args.sourceNotePath);

        const existing = await this.googleTasksApi.getTask(tasklistId, taskId);
        let notes = this.asOptionalString(args.notes);
        if (sourceNotePath) {
            const vaultName = this.plugin.app.vault.getName();
            const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(sourceNotePath)}`;
            const currentNotes = notes ?? existing.notes;
            if (!currentNotes?.includes(uri)) {
                notes = (currentNotes ? currentNotes + "\n\n" : "") + `Source Note: ${uri}`;
            }
        }

        const partialTask: Partial<GoogleTask> = {
            title: this.asOptionalString(args.title),
            notes,
            due: this.asOptionalString(args.due),
            status: this.asOptionalString(args.status) as GoogleTask["status"]
        };
        return await this.googleTasksApi.patchTask(tasklistId, taskId, partialTask);
    }

    private async execDeleteTask(args: Record<string, unknown>): Promise<unknown> {
        const tasklistId = this.asRequiredString(args.tasklistId, "tasklistId");
        const taskId = this.asRequiredString(args.taskId, "taskId");
        await this.googleTasksApi.deleteTask(tasklistId, taskId);
        return { deleted: true, tasklistId, taskId };
    }

    private getDocumentAnalysisToolDeclarations(): ToolDefinition[] {
        return [
            {
                name: "analyze_document_image",
                description: "Phân tích tài liệu công việc từ ảnh scan — OCR + phân loại category + ước lượng",
                parameters: {
                    type: "object",
                    properties: {
                        imageBase64: { type: "string", description: "Base64 encoded image (no data: prefix)" },
                        userContext: { type: "string", description: "Ngữ cảnh bổ sung từ user" }
                    },
                    required: ["imageBase64"]
                }
            },
            {
                name: "create_task_from_analysis",
                description: "Tạo Google Task từ kết quả phân tích DocumentAnalyzer",
                parameters: {
                    type: "object",
                    properties: {
                        jobTitle: { type: "string" },
                        deadline: { type: "string", description: "ISO date YYYY-MM-DD" },
                        notes: { type: "string", description: "Chi tiết và action plan" }
                    },
                    required: ["jobTitle"]
                }
            },
            {
                name: "create_event_from_analysis",
                description: "Tạo Google Calendar event từ phân tích DocumentAnalyzer",
                parameters: {
                    type: "object",
                    properties: {
                        jobTitle: { type: "string" },
                        startDate: { type: "string", description: "RFC3339" },
                        endDate: { type: "string", description: "RFC3339" },
                        description: { type: "string" },
                        timeZone: { type: "string" }
                    },
                    required: ["jobTitle", "startDate", "endDate"]
                }
            }
        ];
    }

    private async execAnalyzeDocumentImage(args: Record<string, unknown>): Promise<unknown> {
        const imageBase64 = this.asRequiredString(args.imageBase64, "imageBase64");
        const userContext = this.asOptionalString(args.userContext);
        if (!this.documentAnalyzer) {
            throw new Error("DocumentAnalyzer chưa được khởi tạo trong plugin.");
        }
        return await this.documentAnalyzer.analyzeDocument(imageBase64, userContext);
    }

    private async execCreateTaskFromAnalysis(args: Record<string, unknown>): Promise<unknown> {
        const title = this.asRequiredString(args.jobTitle, "jobTitle");
        const due = this.asOptionalString(args.deadline);
        const notes = this.asOptionalString(args.notes);
        const task: Partial<GoogleTask> = { title, due, notes };
        return await this.googleTasksApi.createTask("@default", task);
    }

    private async execCreateEventFromAnalysis(args: Record<string, unknown>): Promise<unknown> {
        const summary = this.asRequiredString(args.jobTitle, "jobTitle");
        const startDateTime = this.asRequiredString(args.startDate, "startDate");
        const endDateTime = this.asRequiredString(args.endDate, "endDate");
        const timeZone = this.asOptionalString(args.timeZone) ?? this.getTimezone();
        const event: GoogleCalendarEvent = {
            summary,
            description: this.asOptionalString(args.description),
            start: { dateTime: startDateTime, timeZone },
            end: { dateTime: endDateTime, timeZone }
        };
        return await this.calendarApi.createEvent("primary", event);
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

    private asOptionalBoolean(value: unknown): boolean | undefined {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
            const lower = value.trim().toLowerCase();
            if (lower === "true") return true;
            if (lower === "false") return false;
        }
        return undefined;
    }
}
