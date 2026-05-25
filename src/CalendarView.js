import { ItemView, Notice, Setting } from "obsidian";
export const CALENDAR_VIEW_TYPE = "obsidian-calendar-agent-view";
/**
 * Chat sidebar native DOM cho Obsidian (không dùng React).
 * Session 4: kết nối UI với GeminiAgent.
 */
export class CalendarView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.messages = [];
        this.isSending = false;
        this.plugin = plugin;
    }
    getViewType() {
        return CALENDAR_VIEW_TYPE;
    }
    getDisplayText() {
        return "Calendar Agent";
    }
    getIcon() {
        return "calendar-clock";
    }
    async onOpen() {
        this.renderLayout();
        this.renderMessages();
        this.setStatus("Sẵn sàng.");
    }
    async onClose() {
        this.contentEl.empty();
    }
    renderLayout() {
        const { contentEl } = this;
        contentEl.empty();
        this.rootEl = contentEl.createDiv({ cls: "oca-chat-root" });
        const headerEl = this.rootEl.createDiv({ cls: "oca-chat-header" });
        headerEl.createEl("h3", { text: "obsidian-calendar-agent" });
        headerEl.createEl("p", {
            text: "Gemini + Google Calendar (function calling)"
        });
        this.messagesEl = this.rootEl.createDiv({ cls: "oca-chat-messages" });
        this.statusEl = this.rootEl.createDiv({ cls: "oca-chat-status" });
        this.statusEl.setText("Đang khởi tạo...");
        const composerEl = this.rootEl.createDiv({ cls: "oca-chat-composer" });
        this.inputEl = composerEl.createEl("textarea", {
            cls: "oca-chat-input"
        });
        this.inputEl.placeholder = "Nhập yêu cầu... (VD: Liệt kê lịch hôm nay)";
        this.inputEl.rows = 3;
        // Enter để gửi, Shift+Enter xuống dòng
        this.inputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void this.handleSubmit();
            }
        });
        this.sendBtnEl = composerEl.createEl("button", {
            text: "Gửi",
            cls: "mod-cta oca-chat-send"
        });
        this.sendBtnEl.addEventListener("click", () => {
            void this.handleSubmit();
        });
        new Setting(composerEl)
            .setName("Test nhanh")
            .setDesc("Chạy prompt hardcoded để kiểm tra function calling")
            .addButton((btn) => btn
            .setButtonText("Run test")
            .onClick(async () => {
            const hardcodedMessage = "Hãy liệt kê 5 sự kiện sắp tới trong lịch của tôi.";
            await this.sendMessage(hardcodedMessage);
        }));
    }
    renderMessages() {
        this.messagesEl.empty();
        if (this.messages.length === 0) {
            const emptyEl = this.messagesEl.createDiv({ cls: "oca-chat-empty" });
            emptyEl.setText("Chưa có hội thoại. Hãy gửi tin nhắn đầu tiên.");
            return;
        }
        for (const msg of this.messages) {
            const row = this.messagesEl.createDiv({ cls: `oca-msg oca-msg-${msg.role}` });
            const meta = row.createDiv({ cls: "oca-msg-meta" });
            meta.setText(`${msg.role.toUpperCase()} • ${new Date(msg.createdAt).toLocaleTimeString("vi-VN")}`);
            const body = row.createDiv({ cls: "oca-msg-body" });
            body.setText(msg.content);
        }
        // Auto scroll cuối danh sách
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
    async handleSubmit() {
        const text = this.inputEl.value.trim();
        if (!text)
            return;
        this.inputEl.value = "";
        await this.sendMessage(text);
    }
    async sendMessage(text) {
        if (this.isSending) {
            new Notice("Đang xử lý yêu cầu trước đó. Vui lòng đợi.");
            return;
        }
        this.pushMessage("user", text);
        this.setSending(true);
        try {
            const result = await this.plugin.geminiAgent.run(text);
            this.pushMessage("assistant", result.assistantText || "Đã xử lý xong.");
            if (result.toolTrace.length > 0) {
                const traceText = result.toolTrace
                    .map((t, index) => {
                    const status = t.result.ok ? "OK" : `ERROR: ${t.result.error}`;
                    return `${index + 1}. ${t.toolName} → ${status}`;
                })
                    .join("\n");
                this.pushMessage("tool", `Tool trace:\n${traceText}`);
            }
            this.setStatus("Xử lý xong.");
        }
        catch (error) {
            const message = error.message;
            console.error("[CalendarView] sendMessage failed", error);
            this.pushMessage("assistant", `Lỗi: ${message}`);
            this.setStatus("Có lỗi khi gọi Gemini.");
        }
        finally {
            this.setSending(false);
        }
    }
    setSending(isSending) {
        this.isSending = isSending;
        this.sendBtnEl.disabled = isSending;
        this.inputEl.disabled = isSending;
        this.setStatus(isSending ? "Đang xử lý..." : "Sẵn sàng.");
    }
    setStatus(text) {
        if (this.statusEl) {
            this.statusEl.setText(text);
        }
    }
    pushMessage(role, content) {
        this.messages.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            role,
            content,
            createdAt: new Date().toISOString()
        });
        this.renderMessages();
    }
}
