import { SafetyLayer, SafetyConfirmRequest, UndoEntry } from "../src/SafetyLayer";

// Mock obsidian
jest.mock("obsidian", () => ({
    Modal: class {
        app = {};
        contentEl = { empty: jest.fn(), createEl: jest.fn().mockReturnValue({}), createDiv: jest.fn().mockReturnValue({ addEventListener: jest.fn() }) };
        open() {}
        close() {}
    },
    Notice: jest.fn(),
    Setting: class {
        constructor() {}
        setName() { return this; }
        setDesc() { return this; }
        addToggle() { return this; }
        addText() { return this; }
    }
}));

describe("SafetyLayer", () => {
    let plugin: any;
    let safetyLayer: SafetyLayer;

    beforeEach(() => {
        jest.clearAllMocks();
        plugin = {
            settings: {
                requireSafetyConfirm: true
            }
        };
        safetyLayer = new SafetyLayer(plugin);
    });

    describe("constructor", () => {
        test("should initialize with empty undo stack", () => {
            expect(safetyLayer.getUndoEntries()).toHaveLength(0);
        });
    });

    describe("confirm", () => {
        test("should return true if safety confirm is disabled", async () => {
            plugin.settings.requireSafetyConfirm = false;
            const result = await safetyLayer.confirm({
                action: "create_event",
                summary: "Test event"
            });
            expect(result).toBe(true);
        });

        test("should return true if confirm modal is accepted", async () => {
            // Mock openConfirmModal to return true
            jest.spyOn(safetyLayer as any, "openConfirmModal").mockResolvedValue(true);
            const result = await safetyLayer.confirm({
                action: "create_event",
                summary: "Test event"
            });
            expect(result).toBe(true);
        });

        test("should return false if confirm modal is rejected", async () => {
            jest.spyOn(safetyLayer as any, "openConfirmModal").mockResolvedValue(false);
            const result = await safetyLayer.confirm({
                action: "delete_event",
                summary: "Delete meeting"
            });
            expect(result).toBe(false);
        });

        test("should return false if openConfirmModal throws", async () => {
            jest.spyOn(safetyLayer as any, "openConfirmModal").mockRejectedValue(new Error("Modal failed"));
            const result = await safetyLayer.confirm({
                action: "create_event",
                summary: "Test"
            });
            expect(result).toBe(false);
        });
    });

    describe("registerUndo", () => {
        test("should add entry to undo buffer", () => {
            const entry: UndoEntry = {
                id: "1",
                label: "Test undo",
                rollback: jest.fn(),
                createdAt: new Date().toISOString()
            };
            safetyLayer.registerUndo(entry);
            expect(safetyLayer.getUndoEntries()).toHaveLength(1);
            expect(safetyLayer.getUndoEntries()[0].id).toBe("1");
        });

        test("should limit undo buffer to 20 entries", () => {
            for (let i = 0; i < 25; i++) {
                safetyLayer.registerUndo({
                    id: String(i),
                    label: `Entry ${i}`,
                    rollback: jest.fn(),
                    createdAt: new Date().toISOString()
                });
            }
            expect(safetyLayer.getUndoEntries()).toHaveLength(20);
            // Most recent first
            expect(safetyLayer.getUndoEntries()[0].id).toBe("24");
        });
    });

    describe("undoLast", () => {
        test("should return false if undo buffer is empty", async () => {
            const result = await safetyLayer.undoLast();
            expect(result).toBe(false);
        });

        test("should execute rollback and return true", async () => {
            const rollbackFn = jest.fn().mockResolvedValue(undefined);
            safetyLayer.registerUndo({
                id: "1",
                label: "Undo test",
                rollback: rollbackFn,
                createdAt: new Date().toISOString()
            });

            const result = await safetyLayer.undoLast();
            expect(result).toBe(true);
            expect(rollbackFn).toHaveBeenCalled();
        });

        test("should return false if rollback throws", async () => {
            const rollbackFn = jest.fn().mockRejectedValue(new Error("Rollback failed"));
            safetyLayer.registerUndo({
                id: "1",
                label: "Failing undo",
                rollback: rollbackFn,
                createdAt: new Date().toISOString()
            });

            const result = await safetyLayer.undoLast();
            expect(result).toBe(false);
        });
    });

    describe("getUndoEntries", () => {
        test("should return a copy of undo buffer", () => {
            safetyLayer.registerUndo({
                id: "1",
                label: "Entry 1",
                rollback: jest.fn(),
                createdAt: new Date().toISOString()
            });

            const entries = safetyLayer.getUndoEntries();
            entries.pop(); // Modify the copy

            // Original should still have the entry
            expect(safetyLayer.getUndoEntries()).toHaveLength(1);
        });
    });
});
