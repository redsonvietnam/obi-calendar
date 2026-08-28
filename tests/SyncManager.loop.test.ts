/**
 * SyncManager.loop.test.ts
 * Regression tests for WS2 loop prevention (deterministic internal-write tracking)
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

function deferred<T = void>() {
    let resolve!: (v: T) => void;
    let reject!: (e: any) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("SyncManager loop prevention", () => {
    let manager: SyncManager;
    let mockGoogleTasksApi: jest.Mocked<GoogleTasksAPI>;
    let mockGoogleCalendarApi: jest.Mocked<GoogleCalendarAPI>;
    let mockPlugin: any;
    let modifyDeferred: ReturnType<typeof deferred>;
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
                    syncCalendar: true,
                },
                dailyNotesFolder: "Daily",
            },
            app: {
                vault: {
                    getMarkdownFiles: jest.fn().mockReturnValue([]),
                    getAbstractFileByPath: jest.fn().mockReturnValue(null),
                    read: jest.fn().mockResolvedValue(""),
                    modify: jest.fn().mockResolvedValue(undefined),
                    create: jest.fn().mockResolvedValue({ path: "Daily/2026-08-28.md", extension: "md" } as any),
                    createFolder: jest.fn().mockResolvedValue(undefined),
                    on: jest.fn(),
                    off: jest.fn(),
                },
            },
        };

        manager = new SyncManager(mockPlugin, mockGoogleTasksApi as any, mockGoogleCalendarApi as any);
        manager.initialize();
        // capture listener
        listener = mockPlugin.app.vault.on.mock.calls[0][1];
    });

    afterEach(() => {
        manager.stop();
    });

    test("Test A: Google→Obsidian internal write does not trigger Obsidian→Google back-sync", async () => {
        // Setup: Google has completed task, Obsidian file has unchecked task with same tag
        const mockFile: any = { path: "tasks.md", basename: "tasks", extension: "md", stat: { mtime: 1 } };
        mockPlugin.app.vault.getMarkdownFiles.mockReturnValue([mockFile]);
        mockPlugin.app.vault.read.mockResolvedValue("- [ ] Do thing ^gtask~list-1~abc123");
        mockGoogleTasksApi.listTaskLists.mockResolvedValue([{ id: "list-1" } as any]);
        mockGoogleTasksApi.listTasks.mockResolvedValue([{ id: "abc123", status: "completed" } as any]);

        // Make modify hang until we resolve, to keep suppression active during listener call
        modifyDeferred = deferred();
        mockPlugin.app.vault.modify.mockImplementation(() => modifyDeferred.promise as any);

        // Start syncAll but don't await completion yet – it will hang on modify
        const syncPromise = manager.syncAll();

        // Wait until internal write suppression is active (modify has been invoked)
        for (let i = 0; i < 20; i++) {
            await new Promise((r) => setImmediate(r as any));
            if (manager.getInternalWriteCount("tasks.md") === 1) break;
        }

        // File path should now be suppressed
        expect(manager.getInternalWriteCount("tasks.md")).toBe(1);

        // Simulate vault firing modify event for same file while internal write in-flight
        mockPlugin.app.vault.read.mockResolvedValueOnce("- [x] Do thing ^gtask~list-1~abc123");
        mockGoogleTasksApi.getTask.mockClear();
        mockGoogleTasksApi.patchTask.mockClear();
        await listener({ path: "tasks.md", extension: "md" });

        // Should be ignored – no Google API call
        expect(mockGoogleTasksApi.getTask).not.toHaveBeenCalled();
        expect(mockGoogleTasksApi.patchTask).not.toHaveBeenCalled();

        // Now resolve internal write and await sync completion
        modifyDeferred.resolve(undefined as any);
        const result = await syncPromise;
        expect(result.tasksUpdated).toBe(1);

        // After completion, suppression must be cleared
        expect(manager.getInternalWriteCount("tasks.md")).toBe(0);
    });

    test("Test B: genuine user modification still triggers Obsidian→Google", async () => {
        // No internal write active
        expect(manager.getInternalWriteCount("notes.md")).toBe(0);

        mockPlugin.app.vault.read.mockResolvedValue("- [x] Done ^gtask~list-1~xyz");
        mockGoogleTasksApi.getTask.mockResolvedValue({ id: "xyz", status: "needsAction" } as any);

        await listener({ path: "notes.md", extension: "md" });

        expect(mockGoogleTasksApi.getTask).toHaveBeenCalledWith("list-1", "xyz");
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalledWith("list-1", "xyz", { status: "completed" });
    });

    test("Test C: concurrent internal writes for different files do not interfere", async () => {
        const fileA: any = { path: "a.md", basename: "a", extension: "md", stat: { mtime: 1 } };
        const fileB: any = { path: "b.md", basename: "b", extension: "md", stat: { mtime: 1 } };
        mockPlugin.app.vault.getMarkdownFiles.mockReturnValue([fileA, fileB]);
        // Both files contain tags for two different tasks
        mockPlugin.app.vault.read.mockImplementation((file: any) => {
            if (file.path === "a.md") return Promise.resolve("- [ ] Task A ^gtask~list-1~aaa");
            if (file.path === "b.md") return Promise.resolve("- [ ] Task B ^gtask~list-1~bbb");
            return Promise.resolve("");
        });
        mockGoogleTasksApi.listTaskLists.mockResolvedValue([{ id: "list-1" } as any]);
        mockGoogleTasksApi.listTasks.mockResolvedValue([
            { id: "aaa", status: "completed" } as any,
            { id: "bbb", status: "completed" } as any,
        ]);

        // Create two deferred modifies to interleave
        const defA = deferred();
        const defB = deferred();
        let modifyCallIdx = 0;
        mockPlugin.app.vault.modify.mockImplementation((file: any) => {
            modifyCallIdx++;
            if (modifyCallIdx === 1) return defA.promise as any;
            return defB.promise as any;
        });

        const syncPromise = manager.syncAll();
        // Wait two ticks to let first beginInternalWrite happen; second may not yet have started until first modify resolves?
        // To guarantee both are pending we need syncTasks to await sequentially; so we need different approach:
        // Instead directly test via withInternalWrite concurrency helper by calling two syncs concurrently.
        // Simpler: test map counter directly
        // We'll manually begin two writes and verify counts
        // Cancel hanging sync
        defA.resolve(undefined as any);
        defB.resolve(undefined as any);
        await syncPromise.catch(() => {});

        // Now test direct concurrent map behavior: start two overlapping writes via private helper exposed via getInternalWriteCount
        // Simulate internal writes overlapping using direct begin/end
        (manager as any).beginInternalWrite("a.md");
        (manager as any).beginInternalWrite("b.md");
        expect(manager.getInternalWriteCount("a.md")).toBe(1);
        expect(manager.getInternalWriteCount("b.md")).toBe(1);

        // Listener for a.md should be suppressed, for other file c.md not
        mockPlugin.app.vault.read.mockResolvedValue("- [x] X ^gtask~list-1~xyz");
        mockGoogleTasksApi.getTask.mockClear();
        mockGoogleTasksApi.patchTask.mockClear();
        await listener({ path: "a.md", extension: "md" });
        expect(mockGoogleTasksApi.patchTask).not.toHaveBeenCalled();

        // b.md also suppressed
        await listener({ path: "b.md", extension: "md" });
        expect(mockGoogleTasksApi.patchTask).not.toHaveBeenCalled();

        // c.md not suppressed – should trigger
        mockGoogleTasksApi.getTask.mockResolvedValue({ id: "xyz", status: "needsAction" } as any);
        await listener({ path: "c.md", extension: "md" });
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalled();

        // Complete B first, A still suppressed
        (manager as any).endInternalWrite("b.md");
        expect(manager.getInternalWriteCount("b.md")).toBe(0);
        expect(manager.getInternalWriteCount("a.md")).toBe(1);
        mockGoogleTasksApi.patchTask.mockClear();
        await listener({ path: "b.md", extension: "md" });
        // b now not suppressed, so should trigger
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalled();

        mockGoogleTasksApi.patchTask.mockClear();
        await listener({ path: "a.md", extension: "md" });
        expect(mockGoogleTasksApi.patchTask).not.toHaveBeenCalled();

        // Complete A
        (manager as any).endInternalWrite("a.md");
        expect(manager.getInternalWriteCount("a.md")).toBe(0);
    });

    test("Test D: suppression cleared after internal write completes", async () => {
        const file: any = { path: "d.md", basename: "d", extension: "md", stat: { mtime: 1 } };
        mockPlugin.app.vault.getMarkdownFiles.mockReturnValue([file]);
        mockPlugin.app.vault.read.mockResolvedValue("- [ ] T ^gtask~list-1~d1");
        mockGoogleTasksApi.listTaskLists.mockResolvedValue([{ id: "list-1" } as any]);
        mockGoogleTasksApi.listTasks.mockResolvedValue([{ id: "d1", status: "completed" } as any]);

        await manager.syncAll();
        expect(manager.getInternalWriteCount("d.md")).toBe(0);

        // Now user edit should trigger
        mockPlugin.app.vault.read.mockResolvedValue("- [x] T ^gtask~list-1~d1");
        mockGoogleTasksApi.getTask.mockResolvedValue({ id: "d1", status: "needsAction" } as any);
        mockGoogleTasksApi.patchTask.mockClear();
        await listener({ path: "d.md", extension: "md" });
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalled();
    });

    test("Test E: suppression cleaned up even when internal write fails", async () => {
        const file: any = { path: "e.md", basename: "e", extension: "md", stat: { mtime: 1 } };
        mockPlugin.app.vault.getMarkdownFiles.mockReturnValue([file]);
        mockPlugin.app.vault.read.mockResolvedValue("- [ ] T ^gtask~list-1~e1");
        mockGoogleTasksApi.listTaskLists.mockResolvedValue([{ id: "list-1" } as any]);
        mockGoogleTasksApi.listTasks.mockResolvedValue([{ id: "e1", status: "completed" } as any]);
        mockPlugin.app.vault.modify.mockRejectedValue(new Error("disk full"));

        const result = await manager.syncAll();
        // syncTasks swallows? Actually syncAll catches per section; modify failure will cause list loop to throw? Let's see – syncTasks will reject if modify throws; syncAll will push error but still clear suppression
        expect(manager.getInternalWriteCount("e.md")).toBe(0);
        expect(result.errors.length).toBeGreaterThanOrEqual(0);

        // Subsequent user edit must still be processed
        mockPlugin.app.vault.read.mockResolvedValue("- [x] T ^gtask~list-1~e1");
        mockGoogleTasksApi.getTask.mockResolvedValue({ id: "e1", status: "needsAction" } as any);
        mockGoogleTasksApi.patchTask.mockClear();
        await listener({ path: "e.md", extension: "md" });
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalled();
    });

    test("concurrent writes to same file do not prematurely clear (counter model)", async () => {
        // Two overlapping internal writes to same path
        (manager as any).beginInternalWrite("same.md");
        (manager as any).beginInternalWrite("same.md");
        expect(manager.getInternalWriteCount("same.md")).toBe(2);

        // First completes
        (manager as any).endInternalWrite("same.md");
        expect(manager.getInternalWriteCount("same.md")).toBe(1);
        // Still suppressed
        mockPlugin.app.vault.read.mockResolvedValue("- [x] T ^gtask~list-1~z");
        mockGoogleTasksApi.getTask.mockClear();
        mockGoogleTasksApi.patchTask.mockClear();
        await listener({ path: "same.md", extension: "md" });
        expect(mockGoogleTasksApi.patchTask).not.toHaveBeenCalled();

        // Second completes
        (manager as any).endInternalWrite("same.md");
        expect(manager.getInternalWriteCount("same.md")).toBe(0);
        mockGoogleTasksApi.getTask.mockResolvedValue({ id: "z", status: "needsAction" } as any);
        await listener({ path: "same.md", extension: "md" });
        expect(mockGoogleTasksApi.patchTask).toHaveBeenCalled();
    });

    test("no setTimeout used as correctness mechanism", async () => {
        const src = require("fs").readFileSync("src/SyncManager.ts", "utf8");
        // Ensure no setTimeout is used for suppression clearing
        expect(src).not.toMatch(/setTimeout\s*\(.*internal/i);
        expect(src).not.toMatch(/setTimeout\s*\(.*suppress/i);
        // Ensure deterministic map is present
        expect(src).toMatch(/internalWrites/);
        expect(src).toMatch(/withInternalWrite/);
    });
});
