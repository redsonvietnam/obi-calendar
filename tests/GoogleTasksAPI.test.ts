import { GoogleTasksAPI } from "../src/GoogleTasksAPI";
import { OAuthManager } from "../src/OAuthManager";
import { Plugin } from "obsidian";
import { requestUrl } from "obsidian";

// Mock obsidian
jest.mock("obsidian", () => {
    return {
        Notice: jest.fn(),
        requestUrl: jest.fn(),
        Plugin: class {
            settings = {
                timezone: "Asia/Ho_Chi_Minh"
            };
            async loadData() { return {}; }
            async saveData(data: any) { return; }
        }
    };
});

describe("GoogleTasksAPI", () => {
    let plugin: Plugin;
    let oauthManager: OAuthManager;
    let api: GoogleTasksAPI;

    beforeEach(() => {
        jest.clearAllMocks();
        plugin = new Plugin();
        oauthManager = new OAuthManager(plugin);
        
        // Mock getValidAccessToken to return a token
        (oauthManager.getValidAccessToken as jest.Mock) = jest.fn().mockResolvedValue("test-access-token");
        
        api = new GoogleTasksAPI(plugin, oauthManager);
    });

    describe("listTaskLists", () => {
        test("should call correct endpoint with default params", async () => {
            const mockResponse = {
                status: 200,
                json: {
                    items: [
                        { id: "list-1", title: "My Tasks" }
                    ]
                }
            };
            (requestUrl as jest.Mock).mockResolvedValue(mockResponse);

            const lists = await api.listTaskLists();

            expect(lists).toHaveLength(1);
            expect(lists[0].title).toBe("My Tasks");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                url: expect.stringContaining("/users/@me/lists"),
                method: "GET"
            }));
        });

        test("should apply maxResults param", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 200, json: { items: [] } });

            await api.listTaskLists({ maxResults: 10 });

            const calledUrl = (requestUrl as jest.Mock).mock.calls[0][0].url;
            expect(calledUrl).toContain("maxResults=10");
        });
    });

    describe("listTasks", () => {
        test("should call correct endpoint for a specific list", async () => {
            const mockResponse = {
                status: 200,
                json: {
                    items: [
                        { id: "task-1", title: "Do laundry", status: "needsAction" }
                    ]
                }
            };
            (requestUrl as jest.Mock).mockResolvedValue(mockResponse);

            const tasks = await api.listTasks({ tasklist: "list-123" });

            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe("Do laundry");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                url: expect.stringContaining("/lists/list-123/tasks"),
                method: "GET"
            }));
        });

        test("should use @default if no tasklist provided", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 200, json: { items: [] } });

            await api.listTasks({});

            const calledUrl = (requestUrl as jest.Mock).mock.calls[0][0].url;
            expect(calledUrl).toContain("/lists/%40default/tasks");
        });
    });

    describe("createTask", () => {
        test("should successfully create a task", async () => {
            const task = { title: "New Task" };
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 201,
                json: { id: "task-new", title: "New Task", status: "needsAction" }
            });

            const result = await api.createTask("list-123", task);
            expect(result.id).toBe("task-new");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                method: "POST",
                body: JSON.stringify(task)
            }));
        });

        test("should throw error if title is missing", async () => {
            const invalidTask = { notes: "No title" } as any;
            await expect(api.createTask("list-123", invalidTask)).rejects.toThrow("Task phải có tiêu đề");
        });
    });

    describe("patchTask", () => {
        test("should successfully patch a task", async () => {
            const patch = { status: "completed" };
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 200,
                json: { id: "task-123", status: "completed" }
            });

            const result = await api.patchTask("list-123", "task-123", patch);
            expect(result.status).toBe("completed");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                method: "PATCH",
                url: expect.stringContaining("/tasks/task-123")
            }));
        });
    });

    describe("deleteTask", () => {
        test("should successfully delete a task", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 204 });

            await api.deleteTask("list-123", "task-123");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                method: "DELETE",
                url: expect.stringContaining("/tasks/task-123")
            }));
        });

        test("should throw error if delete fails", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 404,
                json: { error: { code: 404, message: "Not Found" } }
            });

            await expect(api.deleteTask("list-123", "invalid-id")).rejects.toThrow("[GoogleTasksAPI] DELETE");
        });
    });

    describe("getTaskList", () => {
        test("should get a specific task list", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 200,
                json: { id: "list-123", title: "My List" }
            });

            const result = await api.getTaskList("list-123");
            expect(result.id).toBe("list-123");
            expect(result.title).toBe("My List");
        });

        test("should throw if tasklistId is missing", async () => {
            await expect(api.getTaskList("")).rejects.toThrow("tasklistId");
        });
    });

    describe("createTaskList", () => {
        test("should create a new task list", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 200,
                json: { id: "list-new", title: "New List" }
            });

            const result = await api.createTaskList("New List");
            expect(result.title).toBe("New List");
        });

        test("should throw if title is missing", async () => {
            await expect(api.createTaskList("")).rejects.toThrow("title");
        });
    });

    describe("deleteTaskList", () => {
        test("should delete a task list", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 204 });

            await api.deleteTaskList("list-123");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                method: "DELETE",
                url: expect.stringContaining("/lists/list-123")
            }));
        });

        test("should throw if tasklistId is missing", async () => {
            await expect(api.deleteTaskList("")).rejects.toThrow("tasklistId");
        });
    });

    describe("getTask", () => {
        test("should get a specific task", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 200,
                json: { id: "task-123", title: "My Task", status: "needsAction" }
            });

            const result = await api.getTask("list-123", "task-123");
            expect(result.id).toBe("task-123");
        });

        test("should throw if tasklistId is missing", async () => {
            await expect(api.getTask("", "task-123")).rejects.toThrow("tasklistId");
        });

        test("should throw if taskId is missing", async () => {
            await expect(api.getTask("list-123", "")).rejects.toThrow("taskId");
        });
    });

    describe("updateTask", () => {
        test("should update a task", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 200,
                json: { id: "task-123", title: "Updated Task" }
            });

            const result = await api.updateTask("list-123", "task-123", { title: "Updated Task" });
            expect(result.title).toBe("Updated Task");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                method: "PUT"
            }));
        });

        test("should throw if tasklistId is missing", async () => {
            await expect(api.updateTask("", "task-123", { title: "Test" })).rejects.toThrow("tasklistId");
        });

        test("should throw if taskId is missing", async () => {
            await expect(api.updateTask("list-123", "", { title: "Test" })).rejects.toThrow("taskId");
        });
    });

    describe("listTasks options", () => {
        test("should apply showCompleted param", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 200, json: { items: [] } });

            await api.listTasks({ tasklist: "list-1", showCompleted: true });

            const calledUrl = (requestUrl as jest.Mock).mock.calls[0][0].url;
            expect(calledUrl).toContain("showCompleted=true");
        });

        test("should apply showDeleted param", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 200, json: { items: [] } });

            await api.listTasks({ tasklist: "list-1", showDeleted: false });

            const calledUrl = (requestUrl as jest.Mock).mock.calls[0][0].url;
            expect(calledUrl).toContain("showDeleted=false");
        });

        test("should apply showHidden param", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 200, json: { items: [] } });

            await api.listTasks({ tasklist: "list-1", showHidden: true });

            const calledUrl = (requestUrl as jest.Mock).mock.calls[0][0].url;
            expect(calledUrl).toContain("showHidden=true");
        });

        test("should apply sortBy param", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 200, json: { items: [] } });

            await api.listTasks({ tasklist: "list-1", sortBy: "updated" });

            const calledUrl = (requestUrl as jest.Mock).mock.calls[0][0].url;
            expect(calledUrl).toContain("sortBy=updated");
        });

        test("should apply pageToken param", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 200, json: { items: [] } });

            await api.listTasks({ tasklist: "list-1", pageToken: "token-123" });

            const calledUrl = (requestUrl as jest.Mock).mock.calls[0][0].url;
            expect(calledUrl).toContain("pageToken=token-123");
        });

        test("should throw if tasklist is empty string", async () => {
            await expect(api.listTasks({ tasklist: "" })).rejects.toThrow("tasklist");
        });
    });

    describe("error handling", () => {
        test("should handle API error with text body", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 403,
                json: { error: { code: 403, message: "Forbidden" } },
                arrayBuffer: new TextEncoder().encode("Forbidden").buffer
            });

            await expect(api.listTaskLists()).rejects.toThrow();
        });

        test("should handle 204 response (no content)", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 204 });

            // deleteTask returns void, so we just check it doesn't throw
            await api.deleteTask("list-123", "task-123");
            expect(requestUrl).toHaveBeenCalled();
        });
    });
});
