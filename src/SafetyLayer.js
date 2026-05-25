import { Modal, Notice } from "obsidian";
/**
 * Safety layer:
 * - Confirm trước khi thao tác tạo/sửa/xóa lịch
 * - Lưu undo buffer để có thể rollback thao tác gần nhất
 */
export class SafetyLayer {
    constructor(plugin) {
        this.undoBuffer = [];
        this.maxUndoEntries = 20;
        this.plugin = plugin;
    }
    async confirm(request) {
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
        }
        catch (error) {
            console.error("[SafetyLayer] confirm failed", error);
            new Notice("Không thể mở hộp thoại xác nhận. Từ chối thao tác để an toàn.");
            return false;
        }
    }
    registerUndo(entry) {
        this.undoBuffer.unshift(entry);
        if (this.undoBuffer.length > this.maxUndoEntries) {
            this.undoBuffer.pop();
        }
    }
    getUndoEntries() {
        return [...this.undoBuffer];
    }
    async undoLast() {
        const latest = this.undoBuffer.shift();
        if (!latest) {
            new Notice("Không có thao tác nào để hoàn tác.");
            return false;
        }
        try {
            await latest.rollback();
            new Notice(`Đã hoàn tác: ${latest.label}`);
            return true;
        }
        catch (error) {
            console.error("[SafetyLayer] undo failed", error);
            new Notice(`Hoàn tác thất bại: ${error.message}`);
            return false;
        }
    }
    openConfirmModal(request) {
        return new Promise((resolve) => {
            const modal = new SafetyConfirmModal(this.plugin, request, resolve);
            modal.open();
        });
    }
}
class SafetyConfirmModal extends Modal {
    constructor(plugin, request, onDone) {
        super(plugin.app);
        this.resolved = false;
        this.request = request;
        this.onDone = onDone;
    }
    onOpen() {
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
    onClose() {
        this.contentEl.empty();
        // Đóng modal bằng ESC hoặc click outside => xem như từ chối
        this.finish(false);
    }
    finish(accepted) {
        if (this.resolved)
            return;
        this.resolved = true;
        this.onDone(accepted);
    }
}
