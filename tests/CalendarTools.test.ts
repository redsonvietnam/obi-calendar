import { CalendarTools, ToolCallRequest } from "../src/CalendarTools";
import { Plugin, TFile } from "obsidian";
import { requestUrl } from "obsidian";

jest.mock("obsidian", () => {
    class TFile {
        path: string;
        constructor(path: string = "") {
            this.path = path;
        }
    }
    return {
        Notice: jest.fn(),
        requestUrl: jest.fn(),
        normalizePath: (p: string) => p,
        TFile,
        Plugin: class {
            settings = {
                timezone: "Asia/Ho_Chi_Minh",
                geminiApiKey: "test-key",
                googleClientId: "test-id",
                googleClientSecret: "test-secret",
                googleRedirectUri: "http://localhost/callback"
            };
            app = {
                vault: {
                    getName: () => "TestVault",
                    getAbstractFileByPath: jest.fn(),
                    read: jest.fn(),
                    create: jest.fn(),
                    modify: jest.fn(),
                    createFolder: jest.fn(),
                    delete: jest.fn()
                }
            };
            async loadData() { return {}; }
            async saveData() { return; }
        }
    };
});

describe("CalendarTools", () => {
    let plugin: Plugin;
    let tools: CalendarTools;
    let mockCalendarApi: any;
    let mockSafetyLayer: any;
    let mockVaultContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        plugin = new Plugin();

        mockCalendarApi = {
            listEvents: jest.fn().mockResolvedValue([]),
            createEvent: jest.fn().mockResolvedValue({ id: "new-event-id", summary: "Test" }),
            updateEvent: jest.fn().mockResolvedValue({ id: "event-1", summary: "Updated" }),
            getEvent: jest.fn().mockResolvedValue({ id: "event-1", summary: "Existing", start: { dateTime: "2026-01-01T10:00:00Z" }, end: { dateTime: "2026-01-01T11:00:00Z" } }),
            deleteEvent: jest.fn().mockResolvedValue(undefined),
            patchEvent: jest.fn().mockResolvedValue({ id: "event-1" })
        };

        mockSafetyLayer = {
            confirm: jest.fn().mockResolvedValue(true),
            registerUndo: jest.fn()
        };

        mockVaultContext = {
            buildSnapshot: jest.fn().mockResolvedValue("vault snapshot")
        };

        const mockOAuthManager = {
            getValidAccessToken: jest.fn().mockResolvedValue("test-token")
        };

        tools = new CalendarTools({
            plugin,
            calendarApi: mockCalendarApi,
            googleTasksApi: {} as any,
            oauthManager: mockOAuthManager as any,
            vaultContext: mockVaultContext,
            safetyLayer: mockSafetyLayer
        });

        // Mock the internal GoogleTasksAPI methods
        const internalTasksApi = (tools as any).googleTasksApi;
        if (internalTasksApi) {
            internalTasksApi.listTaskLists = jest.fn().mockResolvedValue([{ id: "list-1", title: "My Tasks" }]);
            internalTasksApi.listTasks = jest.fn().mockResolvedValue([{ id: "task-1", title: "Test Task" }]);
            internalTasksApi.createTaskList = jest.fn().mockResolvedValue({ id: "list-1", title: "New List" });
            internalTasksApi.createTask = jest.fn().mockResolvedValue({ id: "task-1", title: "New Task" });
            internalTasksApi.updateTask = jest.fn().mockResolvedValue({ id: "task-1", title: "Updated" });
            internalTasksApi.patchTask = jest.fn().mockResolvedValue({ id: "task-1", title: "Patched" });
            internalTasksApi.deleteTask = jest.fn().mockResolvedValue(undefined);
            internalTasksApi.deleteTaskList = jest.fn().mockResolvedValue(undefined);
            internalTasksApi.getTask = jest.fn().mockResolvedValue({ id: "task-1", title: "Existing Task", notes: "existing notes" });
            internalTasksApi.getTaskList = jest.fn().mockResolvedValue({ id: "list-1", title: "My Tasks" });
        }
    });

    describe("getGeminiToolDeclarations", () => {
        test("should return array of tool definitions", () => {
            const decls = tools.getGeminiToolDeclarations();
            expect(Array.isArray(decls)).toBe(true);
            expect(decls.length).toBeGreaterThan(0);
            expect(decls.find(d => d.name === "list_events")).toBeDefined();
            expect(decls.find(d => d.name === "create_event")).toBeDefined();
        });

        test("should exclude specified tools", () => {
            const decls = tools.getGeminiToolDeclarations(["list_events", "create_event"]);
            expect(decls.find(d => d.name === "list_events")).toBeUndefined();
            expect(decls.find(d => d.name === "create_event")).toBeUndefined();
            expect(decls.length).toBeGreaterThan(0);
        });
    });

    describe("executeTool", () => {
        test("should return error for empty tool name", async () => {
            const result = await tools.executeTool({ name: "", arguments: {} });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tên tool");
        });

        test("should return error for unknown tool", async () => {
            const result = await tools.executeTool({ name: "nonexistent_tool", arguments: {} });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Tool không tồn tại");
        });
    });

    describe("list_events", () => {
        test("should list events successfully", async () => {
            const mockEvents = [
                { id: "1", summary: "Event 1", start: { dateTime: "2026-01-01T10:00:00Z" }, end: { dateTime: "2026-01-01T11:00:00Z" } }
            ];
            mockCalendarApi.listEvents.mockResolvedValue(mockEvents);

            const result = await tools.executeTool({ name: "list_events", arguments: { maxResults: 5 } });
            expect(result.ok).toBe(true);
            expect((result.data as any).events).toEqual(mockEvents);
        });
    });

    describe("create_event", () => {
        test("should create event with valid params", async () => {
            const result = await tools.executeTool({
                name: "create_event",
                arguments: {
                    summary: "Team Meeting",
                    startDateTime: "2026-01-01T10:00:00Z",
                    endDateTime: "2026-01-01T11:00:00Z"
                }
            });
            expect(result.ok).toBe(true);
            expect(mockSafetyLayer.confirm).toHaveBeenCalled();
            expect(mockCalendarApi.createEvent).toHaveBeenCalled();
            expect(mockSafetyLayer.registerUndo).toHaveBeenCalled();
        });

        test("should throw if summary is missing", async () => {
            const result = await tools.executeTool({
                name: "create_event",
                arguments: { startDateTime: "2026-01-01T10:00:00Z", endDateTime: "2026-01-01T11:00:00Z" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: summary");
        });

        test("should throw if startDateTime is missing", async () => {
            const result = await tools.executeTool({
                name: "create_event",
                arguments: { summary: "Test" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: startDateTime");
        });

        test("should throw if user rejects confirmation", async () => {
            mockSafetyLayer.confirm.mockResolvedValue(false);
            const result = await tools.executeTool({
                name: "create_event",
                arguments: {
                    summary: "Rejected Event",
                    startDateTime: "2026-01-01T10:00:00Z",
                    endDateTime: "2026-01-01T11:00:00Z"
                }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("từ chối");
        });
    });

    describe("delete_event", () => {
        test("should delete event with confirmation", async () => {
            const result = await tools.executeTool({
                name: "delete_event",
                arguments: { eventId: "event-to-delete" }
            });
            expect(result.ok).toBe(true);
            expect(mockCalendarApi.deleteEvent).toHaveBeenCalledWith("primary", "event-to-delete");
            expect(mockSafetyLayer.registerUndo).toHaveBeenCalled();
        });

        test("should throw if user rejects", async () => {
            mockSafetyLayer.confirm.mockResolvedValue(false);
            const result = await tools.executeTool({
                name: "delete_event",
                arguments: { eventId: "event-1" }
            });
            expect(result.ok).toBe(false);
        });
    });

    describe("update_event", () => {
        test("should update event with confirmation", async () => {
            const result = await tools.executeTool({
                name: "update_event",
                arguments: { eventId: "event-1", summary: "Updated Summary" }
            });
            expect(result.ok).toBe(true);
            expect(mockCalendarApi.updateEvent).toHaveBeenCalled();
            expect(mockSafetyLayer.registerUndo).toHaveBeenCalled();
        });

        test("should throw if eventId is missing", async () => {
            const result = await tools.executeTool({
                name: "update_event",
                arguments: { summary: "Test" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: eventId");
        });
    });

    describe("get_vault_context", () => {
        test("should return vault snapshot", async () => {
            const result = await tools.executeTool({
                name: "get_vault_context",
                arguments: {}
            });
            expect(result.ok).toBe(true);
            expect(mockVaultContext.buildSnapshot).toHaveBeenCalled();
        });
    });

    describe("list_task_lists", () => {
        test("should list task lists", async () => {
            const result = await tools.executeTool({
                name: "list_task_lists",
                arguments: {}
            });
            expect(result.ok).toBe(true);
        });
    });

    describe("create_task", () => {
        test("should create task with valid params", async () => {
            const result = await tools.executeTool({
                name: "create_task",
                arguments: { title: "New Task" }
            });
            expect(result.ok).toBe(true);
        });

        test("should throw if title is missing", async () => {
            const result = await tools.executeTool({
                name: "create_task",
                arguments: {}
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: title");
        });
    });

    describe("delete_task", () => {
        test("should delete task", async () => {
            const result = await tools.executeTool({
                name: "delete_task",
                arguments: { tasklistId: "list-1", taskId: "task-1" }
            });
            expect(result.ok).toBe(true);
        });

        test("should throw if tasklistId is missing", async () => {
            const result = await tools.executeTool({
                name: "delete_task",
                arguments: { taskId: "task-1" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: tasklistId");
        });
    });

    describe("patch_task", () => {
        test("should patch task", async () => {
            const result = await tools.executeTool({
                name: "patch_task",
                arguments: { tasklistId: "list-1", taskId: "task-1", title: "Patched Task" }
            });
            expect(result.ok).toBe(true);
        });

        test("should throw if tasklistId is missing", async () => {
            const result = await tools.executeTool({
                name: "patch_task",
                arguments: { taskId: "task-1", title: "Patched" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: tasklistId");
        });
    });

    describe("list_tasks", () => {
        test("should list tasks successfully", async () => {
            const result = await tools.executeTool({
                name: "list_tasks",
                arguments: { tasklistId: "list-1", maxResults: 10 }
            });
            expect(result.ok).toBe(true);
        });

        test("should list tasks with defaults", async () => {
            const result = await tools.executeTool({
                name: "list_tasks",
                arguments: {}
            });
            expect(result.ok).toBe(true);
        });
    });

    describe("create_task_list", () => {
        test("should create task list", async () => {
            const result = await tools.executeTool({
                name: "create_task_list",
                arguments: { title: "New List" }
            });
            expect(result.ok).toBe(true);
        });

        test("should throw if title is missing", async () => {
            const result = await tools.executeTool({
                name: "create_task_list",
                arguments: {}
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: title");
        });
    });

    describe("delete_task_list", () => {
        test("should delete task list", async () => {
            const result = await tools.executeTool({
                name: "delete_task_list",
                arguments: { tasklistId: "list-1" }
            });
            expect(result.ok).toBe(true);
        });

        test("should throw if tasklistId is missing", async () => {
            const result = await tools.executeTool({
                name: "delete_task_list",
                arguments: {}
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: tasklistId");
        });
    });

    describe("update_task", () => {
        test("should update task", async () => {
            const internalTasksApi = (tools as any).googleTasksApi;
            internalTasksApi.getTask.mockResolvedValue({ id: "task-1", title: "Old", notes: "old notes" });
            const result = await tools.executeTool({
                name: "update_task",
                arguments: { tasklistId: "list-1", taskId: "task-1", title: "Updated Task" }
            });
            expect(result.ok).toBe(true);
        });

        test("should throw if tasklistId is missing", async () => {
            const result = await tools.executeTool({
                name: "update_task",
                arguments: { taskId: "task-1" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: tasklistId");
        });

        test("should throw if taskId is missing", async () => {
            const result = await tools.executeTool({
                name: "update_task",
                arguments: { tasklistId: "list-1" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: taskId");
        });
    });

    describe("write_vault_note", () => {
        test("should write vault note to existing file", async () => {
            const mockFile = new TFile("test.md");
            plugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFile);
            plugin.app.vault.modify = jest.fn().mockResolvedValue(undefined);

            const result = await tools.executeTool({
                name: "write_vault_note",
                arguments: { path: "test.md", content: "Hello World" }
            });
            expect(result.ok).toBe(true);
            expect(plugin.app.vault.modify).toHaveBeenCalled();
        });

        test("should create file if not exists", async () => {
            plugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);
            plugin.app.vault.create = jest.fn().mockResolvedValue(undefined);

            const result = await tools.executeTool({
                name: "write_vault_note",
                arguments: { path: "new.md", content: "New content" }
            });
            expect(result.ok).toBe(true);
            expect(plugin.app.vault.create).toHaveBeenCalled();
        });

        test("should throw if path is missing", async () => {
            const result = await tools.executeTool({
                name: "write_vault_note",
                arguments: { content: "Hello" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: path");
        });

        test("should throw if content is missing", async () => {
            const result = await tools.executeTool({
                name: "write_vault_note",
                arguments: { path: "test.md" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: content");
        });

        test("should create folder if not exists", async () => {
            plugin.app.vault.getAbstractFileByPath = jest.fn()
                .mockReturnValueOnce(null) // file check
                .mockReturnValueOnce(null); // folder check
            plugin.app.vault.createFolder = jest.fn().mockResolvedValue(undefined);
            plugin.app.vault.create = jest.fn().mockResolvedValue(undefined);

            const result = await tools.executeTool({
                name: "write_vault_note",
                arguments: { path: "subdir/new.md", content: "Content" }
            });
            expect(result.ok).toBe(true);
            expect(plugin.app.vault.createFolder).toHaveBeenCalledWith("subdir");
        });

        test("should throw if user rejects", async () => {
            mockSafetyLayer.confirm.mockResolvedValue(false);
            const result = await tools.executeTool({
                name: "write_vault_note",
                arguments: { path: "test.md", content: "Hello" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("từ chối");
        });
    });

    describe("append_vault_note", () => {
        test("should append to existing vault note", async () => {
            const mockFile = new TFile("test.md");
            plugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(mockFile);
            plugin.app.vault.read = jest.fn().mockResolvedValue("existing content\n");
            plugin.app.vault.modify = jest.fn().mockResolvedValue(undefined);

            const result = await tools.executeTool({
                name: "append_vault_note",
                arguments: { path: "test.md", contentToAppend: "Appended text" }
            });
            expect(result.ok).toBe(true);
        });

        test("should create file if not exists on append", async () => {
            plugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);
            plugin.app.vault.create = jest.fn().mockResolvedValue(undefined);

            const result = await tools.executeTool({
                name: "append_vault_note",
                arguments: { path: "new.md", contentToAppend: "New content" }
            });
            expect(result.ok).toBe(true);
        });

        test("should throw if path is missing", async () => {
            const result = await tools.executeTool({
                name: "append_vault_note",
                arguments: { contentToAppend: "Hello" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: path");
        });

        test("should throw if contentToAppend is missing", async () => {
            const result = await tools.executeTool({
                name: "append_vault_note",
                arguments: { path: "test.md" }
            });
            expect(result.ok).toBe(false);
            expect(result.error).toContain("Thiếu tham số bắt buộc: contentToAppend");
        });
    });
});
