/**
 * SyncManager.identity.test.ts
 * Regression tests for WS4 Task List Identity & Bidirectional Sync Correctness
 */

import { SyncManager } from "../src/SyncManager";
import { GoogleTasksAPI } from "../src/GoogleTasksAPI";
import { GoogleCalendarAPI } from "../src/GoogleCalendarAPI";

(global as any).window = {
    setInterval: jest.fn(() => 123),
    clearInterval: jest.fn(),
};

jest.mock("obsidian", () => ({
    Notice: jest.fn(),
    TFile: class TFile {
        path = "";
        basename = "";
        extension = "md";
        stat = { mtime: 0 };
    },
}));

jest.mock("../src/Logger", () => ({
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe("SyncManager task list identity", () => {
    let manager: SyncManager;
    let mockGoogleTasksApi: jest.Mocked<GoogleTasksAPI>;
    let mockGoogleCalendarApi: jest.Mocked<GoogleCalendarAPI>;
    let mockPlugin: any;
    let listener: (file: any) => Promise<void>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockGoogleTasksApi = {
            listTaskLists: jest.fn().mockResolvedValue([]),
            listTasks: jest.fn().mockResolvedValue([]),
            getTask: jest.fn().mockResolvedValue({ id: "abc", status: "needsAction" }),
            patchTask: jest.fn().mockResolvedValue({}),
            createTask: jest.fn(),
            deleteTask: jest.fn(),
        } as any;

        mockGoogleCalendarApi = {
            listEvents: jest.fn().mockResolvedValue([]),
        } as any;

        mockPlugin = {
            settings: {
                sync: {
                    enabled: false,
                    intervalMinutes: 5,
                    syncTasks: true,
                    syncCalendar: false,
                },
                dailyNotesFolder: "Daily",
            },
            app: {
                vault: {
                    getMarkdownFiles: jest.fn().mockReturnValue([]),
                    getAbstractFileByPath: jest.fn().mockReturnValue(null),
                    read: jest.fn().mockResolvedValue(""),
                    modify: jest.fn().mockResolvedValue(undefined),
                    create: jest.fn().mockResolvedValue({ path: "test.md", extension: "md" } as any),
                    createFolder: jest.fn().mockResolvedValue(undefined),
                    on: jest.fn(),
                    off: jest.fn(),
                },
            },
        };

        manager = new SyncManager(mockPlugin, mockGoogleTasksApi as any, mockGoogleCalendarApi as any);
        manager.initialize();
        listener = mockPlugin.app.vault.on.mock.calls[0][1];
    });

    afterEach(() => {
        manager.stop();
    });

    test("Test A — List A round trip", async () => {
        mockPlugin.app.vault.read.mockResolvedValue("- [x] Done ^gtask~listA~task1");
        mockGoogleTasksApi.getTask.mockResolvedValue({ id: "task1", status: "needsAction" } as any);

        await listener({ path: "tasks.md", extension: "md" });

        expect(mockGoogleTasksApi.getTask).toHaveBeenCalledWith("listA", "task1");
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalledWith("listA", "task1", { status: "completed" });
    });

    test("Test B — List B round trip", async () => {
        mockPlugin.app.vault.read.mockResolvedValue("- [x] Done ^gtask~listB~task2");
        mockGoogleTasksApi.getTask.mockResolvedValue({ id: "task2", status: "needsAction" } as any);

        await listener({ path: "tasks.md", extension: "md" });

        expect(mockGoogleTasksApi.getTask).toHaveBeenCalledWith("listB", "task2");
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalledWith("listB", "task2", { status: "completed" });
    });

    test("Test C — Cross-list isolation", async () => {
        // Task A in List A, Task B in List B in same file modification
        mockPlugin.app.vault.read.mockResolvedValue(
            "- [x] Done A ^gtask~listA~taskA\n- [ ] Pending B ^gtask~listB~taskB"
        );
        
        // Mock getTask to return status opposite to trigger patches
        mockGoogleTasksApi.getTask.mockImplementation((listId, taskId) => {
            if (listId === "listA" && taskId === "taskA") {
                return Promise.resolve({ id: "taskA", status: "needsAction" } as any);
            }
            if (listId === "listB" && taskId === "taskB") {
                // Currently [ ] in Obsidian, so if Google tasks is completed, we will patch it to needsAction
                return Promise.resolve({ id: "taskB", status: "completed" } as any);
            }
            return Promise.resolve(null);
        });

        await listener({ path: "tasks.md", extension: "md" });

        // Verify Task A was resolved and patched only on listA
        expect(mockGoogleTasksApi.getTask).toHaveBeenCalledWith("listA", "taskA");
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalledWith("listA", "taskA", { status: "completed" });
        expect(mockGoogleTasksApi.getTask).not.toHaveBeenCalledWith("listB", "taskA");
        expect(mockGoogleTasksApi.patchTask).not.toHaveBeenCalledWith("listB", "taskA", expect.any(Object));

        // Verify Task B was resolved and patched only on listB
        expect(mockGoogleTasksApi.getTask).toHaveBeenCalledWith("listB", "taskB");
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalledWith("listB", "taskB", { status: "needsAction" });
        expect(mockGoogleTasksApi.getTask).not.toHaveBeenCalledWith("listA", "taskB");
        expect(mockGoogleTasksApi.patchTask).not.toHaveBeenCalledWith("listA", "taskB", expect.any(Object));
    });

    test("Test D — Legacy representation fallback to @default", async () => {
        // Legacy: ^gtask-legacyTaskId (no dash representing list ID)
        mockPlugin.app.vault.read.mockResolvedValue("- [x] Done Legacy ^gtask-legacy123");
        mockGoogleTasksApi.getTask.mockResolvedValue({ id: "legacy123", status: "needsAction" } as any);

        await listener({ path: "tasks.md", extension: "md" });

        expect(mockGoogleTasksApi.getTask).toHaveBeenCalledWith("@default", "legacy123");
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalledWith("@default", "legacy123", { status: "completed" });
    });

    test("Test E — Default list behavior", async () => {
        // Explicitly format with @default list name
        mockPlugin.app.vault.read.mockResolvedValue("- [x] Done Default ^gtask~@default~taskD");
        mockGoogleTasksApi.getTask.mockResolvedValue({ id: "taskD", status: "needsAction" } as any);

        await listener({ path: "tasks.md", extension: "md" });

        expect(mockGoogleTasksApi.getTask).toHaveBeenCalledWith("@default", "taskD");
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalledWith("@default", "taskD", { status: "completed" });
    });

    test("Test G — Persistence across modify (Google -> Obsidian write preserves correct list ID)", async () => {
        const mockFile: any = { path: "tasks.md", basename: "tasks", extension: "md", stat: { mtime: 1 } };
        mockPlugin.app.vault.getMarkdownFiles.mockReturnValue([mockFile]);
        
        // Initial Obsidian state has unchecked task with list identity
        mockPlugin.app.vault.read.mockResolvedValue("- [ ] Task ^gtask~listCustom~taskC");
        
        // Google has completed task on listCustom
        mockGoogleTasksApi.listTaskLists.mockResolvedValue([{ id: "listCustom", title: "Custom List" } as any]);
        mockGoogleTasksApi.listTasks.mockResolvedValue([{ id: "taskC", status: "completed" } as any]);

        // Run Google -> Obsidian sync
        await manager.syncAll();

        // Verify that modify was called with the correct list ID preserved in the tag
        expect(mockPlugin.app.vault.modify).toHaveBeenCalledWith(
            mockFile,
            expect.stringContaining("- [x] Task ^gtask~listCustom~taskC")
        );
    });
});
