import { Modal, Notice } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";

export type SafetyActionType = "create_event" | "update_event" | "delete_event" | "write_note";

export interface SafetyConfirmRequest {
    action: SafetyActionType;
    summary: string;
    details?: string[];
}

export interface UndoEntry {
    id: string;
    label: string;
    rollback: () => Promise<void>;
    createdAt: string;
}

/**
 * Safety layer:
 * - Confirm trước khi thao tác tạo/sửa/xóa lịch
 * - Lưu undo buffer để có thể rollback thao tác gần nhất
 */
export class SafetyLayer {
    private readonly plugin: ObsidianCalendarAgentPlugin;
    private readonly undoBuffer: UndoEntry[] = [];
    private readonly maxUndoEntries = 20;

    constructor(plugin: ObsidianCalendarAgentPlugin) {
        this.plugin = plugin;
    }

    async confirm(request: SafetyConfirmRequest): Promise<boolean> {
        // Nếu user tắt safety confirm trong settings thì bỏ qua confirm.
        if (!this.plugin.settings.requireSafetyConfirm) {
            return true;
        }

        try {
            const accepted = await this.openConfirmModal(request);
            if (!accepted) {
                new Notice("Đã hủy thao tác theo yêu cầu an toàn.");
            }
            return accepted;
        } catch (error) {
            console.error("[SafetyLayer] confirm failed", error);
            new Notice("Không thể mở hộp thoại xác nhận. Từ chối thao tác để an toàn.");
            return false;
        }
    }

    registerUndo(entry: UndoEntry): void {
        this.undoBuffer.unshift(entry);
        if (this.undoBuffer.length > this.maxUndoEntries) {
            this.undoBuffer.pop();
        }
    }

    getUndoEntries(): UndoEntry[] {
        return [...this.undoBuffer];
    }

    async undoLast(): Promise<boolean> {
        const latest = this.undoBuffer.shift();
        if (!latest) {
            new Notice("Không có thao tác nào để hoàn tác.");
            return false;
        }

        try {
            await latest.rollback();
            new Notice(`Đã hoàn tác: ${latest.label}`);
            return true;
        } catch (error) {
            console.error("[SafetyLayer] undo failed", error);
            new Notice(`Hoàn tác thất bại: ${(error as Error).message}`);
            return false;
        }
    }

    private openConfirmModal(request: SafetyConfirmRequest): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new SafetyConfirmModal(this.plugin, request, resolve);
            modal.open();
        });
    }
}

class SafetyConfirmModal extends Modal {
    private readonly request: SafetyConfirmRequest;
    private readonly onDone: (accepted: boolean) => void;
    private resolved = false;

    constructor(
        plugin: ObsidianCalendarAgentPlugin,
        request: SafetyConfirmRequest,
        onDone: (accepted: boolean) => void
    ) {
        super(plugin.app);
        this.request = request;
        this.onDone = onDone;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h3", { text: "Xác nhận thao tác lịch" });
        contentEl.createEl("p", {
            text: this.request.summary
        });

        if (this.request.details?.length) {
            const listEl = contentEl.createEl("ul");
            for (const line of this.request.details) {
                listEl.createEl("li", { text: line });
            }
        }

        const actionRow = contentEl.createDiv({ cls: "oca-confirm-actions" });
        const cancelBtn = actionRow.createEl("button", { text: "Hủy" });
        cancelBtn.addEventListener("click", () => {
            this.finish(false);
            this.close();
        });

        const confirmBtn = actionRow.createEl("button", {
            text: "Xác nhận",
            cls: "mod-warning"
        });
        confirmBtn.addEventListener("click", () => {
            this.finish(true);
            this.close();
        });
    }

    onClose(): void {
        this.contentEl.empty();
        // Đóng modal bằng ESC hoặc click outside => xem như từ chối
        this.finish(false);
    }

    private finish(accepted: boolean): void {
        if (this.resolved) return;
        this.resolved = true;
        this.onDone(accepted);
    }
}