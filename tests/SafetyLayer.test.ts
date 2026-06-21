/**
 * SafetyLayer.test.ts
 * Comprehensive tests for safety confirmations and undo functionality
 */

import { SafetyLayer, SafetyConfirmRequest, UndoEntry } from "../src/SafetyLayer";

// Mock contentEl helper
const createMockContentEl = () => {
    const children: any[] = [];
    const el: any = {
        empty: jest.fn(),
        createEl: jest.fn().mockImplementation((tag: string, opts?: any) => {
            const child = createMockContentEl();
            child.setText = jest.fn();
            child.addEventListener = jest.fn();
            child.setText(opts?.text || "");
            children.push(child);
            return child;
        }),
        createDiv: jest.fn().mockImplementation((opts?: any) => {
            const child = createMockContentEl();
            children.push(child);
            return child;
        }),
        createSpan: jest.fn().mockImplementation((opts?: any) => {
            const child = createMockContentEl();
            children.push(child);
            return child;
        }),
        appendText: jest.fn(),
        addClass: jest.fn(),
        children
    };
    return el;
};

// Mock obsidian
jest.mock("obsidian", () => ({
    Modal: class MockModal {
        app: any;
        contentEl: any;
        
        constructor(app: any) {
            this.app = app;
            this.contentEl = createMockContentEl();
        }
        
        open() {
            // Call onOpen if defined
            (this as any).onOpen?.();
        }
        
        close() {
            (this as any).onClose?.();
        }
    },
    Notice: jest.fn(),
    Setting: class Setting {
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

        test("should return true for write_note action", async () => {
            plugin.settings.requireSafetyConfirm = false;
            const result = await safetyLayer.confirm({
                action: "write_note",
                summary: "Write to note"
            });
            expect(result).toBe(true);
        });

        test("should return true for update_event action", async () => {
            plugin.settings.requireSafetyConfirm = false;
            const result = await safetyLayer.confirm({
                action: "update_event",
                summary: "Update event"
            });
            expect(result).toBe(true);
        });
    });

    describe("confirmAnalysis", () => {
        test("should be defined", () => {
            expect(typeof safetyLayer.confirmAnalysis).toBe("function");
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

        test("should add entries in order", () => {
            safetyLayer.registerUndo({
                id: "first",
                label: "First",
                rollback: jest.fn(),
                createdAt: new Date().toISOString()
            });
            safetyLayer.registerUndo({
                id: "second",
                label: "Second",
                rollback: jest.fn(),
                createdAt: new Date().toISOString()
            });
            
            const entries = safetyLayer.getUndoEntries();
            expect(entries[0].id).toBe("second");
            expect(entries[1].id).toBe("first");
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

        test("should remove entry from buffer after undo", async () => {
            const rollbackFn = jest.fn().mockResolvedValue(undefined);
            safetyLayer.registerUndo({
                id: "1",
                label: "Undo test",
                rollback: rollbackFn,
                createdAt: new Date().toISOString()
            });

            await safetyLayer.undoLast();
            expect(safetyLayer.getUndoEntries()).toHaveLength(0);
        });

        test("should undo only the latest entry", async () => {
            const rollback1 = jest.fn().mockResolvedValue(undefined);
            const rollback2 = jest.fn().mockResolvedValue(undefined);
            
            safetyLayer.registerUndo({
                id: "1",
                label: "First",
                rollback: rollback1,
                createdAt: new Date().toISOString()
            });
            safetyLayer.registerUndo({
                id: "2",
                label: "Second",
                rollback: rollback2,
                createdAt: new Date().toISOString()
            });

            await safetyLayer.undoLast();
            expect(rollback2).toHaveBeenCalled();
            expect(rollback1).not.toHaveBeenCalled();
            expect(safetyLayer.getUndoEntries()).toHaveLength(1);
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

        test("should return empty array initially", () => {
            expect(safetyLayer.getUndoEntries()).toEqual([]);
        });
    });
});
