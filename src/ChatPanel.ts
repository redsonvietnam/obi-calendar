/**
 * ChatPanel.ts
 * 
 * Responsible for all chat UI logic:
 * - Message rendering
 * - Chat input and submission
 * - File attachment handling
 * - Status management
 * 
 * SDD Principle: Single Responsibility - only handles chat concerns
 */

import { Notice, App } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { ChatMessage, GeminiContent } from "./types";
import { PromptModal } from "./PromptModal";
import { Logger } from "./Logger";

/**
 * ChatPanel manages the chat interface and user interactions
 */
export class ChatPanel {
    private plugin: ObsidianCalendarAgentPlugin;
    private app: App;

    // Chat state
    private messages: ChatMessage[] = [];
    private geminiHistory: GeminiContent[] = [];
    private attachedFiles: string[] = [];
    private isSending = false;
    private abortController: AbortController | null = null;

    // UI Elements
    private chatPanelEl!: HTMLDivElement;
    private messagesEl!: HTMLDivElement;
    private inputEl!: HTMLTextAreaElement;
    private sendBtnEl!: HTMLButtonElement;
    private stopBtnEl!: HTMLButtonElement;
    private statusEl!: HTMLDivElement;
    private fileInputEl!: HTMLInputElement;
    private attachedFilesEl!: HTMLDivElement;

    // Callbacks
    private onSendMessage?: (
        message: string,
        imageBase64?: string
    ) => Promise<void>;

    constructor(plugin: ObsidianCalendarAgentPlugin, app: App) {
        this.plugin = plugin;
        this.app = app;
    }

    /**
     * Initialize chat panel with DOM element and callbacks
     */
    public init(
        parentEl: HTMLDivElement,
        onSendMessage: (message: string, imageBase64?: string) => Promise<void>
    ): void {
        this.chatPanelEl = parentEl;
        this.onSendMessage = onSendMessage;
        this.render();
    }

    /**
     * Render the entire chat panel
     */
    private render(): void {
        this.chatPanelEl.empty();
        this.chatPanelEl.addClass("oca-tab-content");

        // Messages container
        this.messagesEl = this.chatPanelEl.createDiv({ cls: "oca-chat-messages" });

        // Header
        this.renderHeader();

        // Status bar
        this.statusEl = this.chatPanelEl.createDiv({ cls: "oca-chat-status" });
        this.setStatus("Sẵn sàng · Gemini · Google Calendar");

        // Suggestion drawer
        this.renderSuggestionDrawer();

        // Composer
        this.renderComposer();

        // Initial message
        this.renderMessages();
    }

    /**
     * Render chat header with suggestions toggle
     */
    private renderHeader(): void {
        const chatHeader = this.chatPanelEl.createDiv({ cls: "oca-chat-header" });
        chatHeader.createEl("h3", { text: "Calendar Agent" });

        const suggestionToggle = chatHeader.createEl("button", {
            cls: "oca-header-btn",
            text: "💡 Suggestions"
        });
        suggestionToggle.title = "Mở/đóng suggestion drawer";
        suggestionToggle.addEventListener("click", () => {
            this.toggleSuggestionDrawer();
        });
    }

    /**
     * Render suggestion drawer with quick actions
     */
    private renderSuggestionDrawer(): void {
        const drawerEl = this.chatPanelEl.createDiv({
            cls: "oca-suggestion-drawer collapsed"
        });
        const drawerContent = drawerEl.createDiv({ cls: "oca-suggestion-drawer-content" });
        const quickBarEl = drawerContent.createDiv({ cls: "oca-quick-actions" });

        // Process Note button
        const processNoteBtn = quickBarEl.createEl("button", {
            cls: "oca-pill oca-pill-primary",
            text: "📝 Note"
        });
        processNoteBtn.title = "Xử lý Note hiện tại";
        processNoteBtn.addEventListener("click", () => {
            void this.plugin.processCurrentNote();
        });

        // Scan Inbox button
        const scanInboxBtn = quickBarEl.createEl("button", {
            cls: "oca-pill",
            text: "📥 Inbox"
        });
        scanInboxBtn.title = "Quét và xử lý ghi chú trong Inbox";
        scanInboxBtn.addEventListener("click", () => {
            void this.plugin.scanInbox();
        });

        // Quick prompts
        const quickPrompts: Array<{ label: string; prompt: string }> = [
            { label: "📅 Hôm nay", prompt: "Hãy liệt kê lịch hôm nay của tôi." },
            {
                label: "⏭ 5 sự kiện tới",
                prompt: "Hãy liệt kê 5 sự kiện sắp tới trong lịch của tôi."
            },
            {
                label: "📋 Tuần này",
                prompt: "Tóm tắt các sự kiện quan trọng trong tuần này."
            }
        ];

        for (const item of quickPrompts) {
            const btn = quickBarEl.createEl("button", {
                cls: "oca-pill",
                text: item.label
            });
            btn.addEventListener("click", () => {
                void this.sendMessage(item.prompt);
            });
        }
    }

    /**
     * Toggle suggestion drawer visibility
     */
    private toggleSuggestionDrawer(): void {
        const drawer = this.chatPanelEl.querySelector(
            ".oca-suggestion-drawer"
        ) as HTMLElement | null;
        if (drawer) {
            drawer.classList.toggle("collapsed");
        }
    }

    /**
     * Render message composer (textarea + buttons)
     */
    private renderComposer(): void {
        const composerEl = this.chatPanelEl.createDiv({ cls: "oca-chat-composer" });

        // Attached files display
        this.attachedFilesEl = composerEl.createDiv({ cls: "oca-attached-files" });

        const inputWrap = composerEl.createDiv({ cls: "oca-input-wrap" });

        // Hidden file input
        this.fileInputEl = inputWrap.createEl("input", {
            type: "file",
            cls: "oca-file-input"
        });
        this.fileInputEl.multiple = true;
        this.fileInputEl.style.display = "none";
        this.fileInputEl.addEventListener("change", () =>
            this.handleFileSelection()
        );

        // Attach button
        const attachBtn = inputWrap.createEl("button", {
            text: "📎",
            cls: "oca-chat-attach",
            title: "Đính kèm ảnh hoặc tài liệu"
        });
        attachBtn.addEventListener("click", () => {
            this.fileInputEl.click();
        });

        // Text input
        this.inputEl = inputWrap.createEl("textarea", {
            cls: "oca-chat-input"
        });
        this.inputEl.placeholder =
            "Nhập yêu cầu... (VD: Đặt lịch họp 9h sáng mai)";
        this.inputEl.rows = 1;

        this.inputEl.addEventListener("input", () => {
            this.inputEl.style.height = "auto";
            this.inputEl.style.height =
                Math.min(this.inputEl.scrollHeight, 120) + "px";
        });

        this.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void this.handleSubmit();
            }
        });

        // Send button
        this.sendBtnEl = inputWrap.createEl("button", {
            text: "Gửi",
            cls: "mod-cta oca-chat-send"
        });
        this.sendBtnEl.addEventListener("click", () => {
            void this.handleSubmit();
        });

        // Stop button
        this.stopBtnEl = inputWrap.createEl("button", {
            text: "Dừng",
            cls: "mod-warning oca-chat-stop"
        });
        this.stopBtnEl.addEventListener("click", () => {
            this.abortController?.abort();
            this.setStatus("Đã dừng.");
            this.setSending(false);
        });
        this.stopBtnEl.style.display = "none";
    }

    /**
     * Handle file selection from input
     */
    private async handleFileSelection(): Promise<void> {
        const files = this.fileInputEl.files;
        if (!files || files.length === 0) return;

        try {
            const attachmentsPath = "attachments";

            // Ensure attachments folder exists
            try {
                await this.app.vault.getAbstractFileByPath(attachmentsPath);
            } catch {
                await this.app.vault.createFolder(attachmentsPath);
            }

            // Process each file
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileName = file.name;
                let filePath = `${attachmentsPath}/${fileName}`;

                // Handle duplicate filenames
                let counter = 1;
                const nameParts = fileName.split(".");
                const baseName = nameParts.slice(0, -1).join(".");
                const extension = nameParts[nameParts.length - 1];

                let fileExists = true;
                while (fileExists) {
                    try {
                        await this.app.vault.getAbstractFileByPath(filePath);
                        filePath = `${attachmentsPath}/${baseName}_${counter}.${extension}`;
                        counter++;
                    } catch {
                        fileExists = false;
                    }
                }

                // Save file to vault
                const arrayBuffer = await file.arrayBuffer();
                await this.app.vault.createBinary(filePath, arrayBuffer);

                if (!this.attachedFiles.includes(filePath)) {
                    this.attachedFiles.push(filePath);
                }
            }

            this.renderAttachedFiles();
            new Notice(`Đã thêm ${files.length} file.`);
            this.fileInputEl.value = "";
        } catch (error) {
            Logger.error("ChatPanel", "File upload error:", error);
            new Notice(`Lỗi tải file: ${(error as Error).message}`);
        }
    }

    /**
     * Render attached files display
     */
    private renderAttachedFiles(): void {
        this.attachedFilesEl.empty();

        if (this.attachedFiles.length === 0) {
            this.attachedFilesEl.style.display = "none";
            return;
        }

        this.attachedFilesEl.style.display = "block";
        const filesContainer = this.attachedFilesEl.createDiv({
            cls: "oca-files-container"
        });

        for (const filePath of this.attachedFiles) {
            const chip = filesContainer.createDiv({ cls: "oca-file-chip" });

            const fileName = filePath.split("/").pop() || filePath;
            const extension = fileName.split(".").pop()?.toLowerCase() || "";

            let icon = "📄";
            if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension)) {
                icon = "🖼️";
            } else if (["pdf"].includes(extension)) {
                icon = "📕";
            } else if (["doc", "docx", "txt"].includes(extension)) {
                icon = "📝";
            }

            const fileNameSpan = chip.createSpan({ text: `${icon} ${fileName}` });
            fileNameSpan.addClass("oca-file-name");

            const removeBtn = chip.createEl("button", {
                text: "✕",
                cls: "oca-file-remove"
            });
            removeBtn.addEventListener("click", () => {
                this.removeAttachedFile(filePath);
            });
        }
    }

    /**
     * Remove attached file
     */
    private removeAttachedFile(filePath: string): void {
        this.attachedFiles = this.attachedFiles.filter(f => f !== filePath);
        this.renderAttachedFiles();
        new Notice(`Đã xóa: ${filePath.split("/").pop()}`);
    }

    /**
     * Handle message submission
     */
    private async handleSubmit(): Promise<void> {
        const message = this.inputEl.value.trim();
        if (!message || this.isSending) return;

        // Check for image file
        let imageBase64: string | undefined;
        for (const filePath of this.attachedFiles) {
            const ext = filePath.split(".").pop()?.toLowerCase();
            if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) {
                try {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    const content = await this.app.vault.readBinary(
                        file as any
                    );
                    const blob = new Blob([content], { type: `image/${ext}` });
                    imageBase64 = await this.blobToBase64(blob);
                    break;
                } catch (error) {
                    Logger.error("ChatPanel", "Failed to read image:", error);
                }
            }
        }

        await this.sendMessage(message, imageBase64);
    }

    /**
     * Send message to AI agent
     */
    async sendMessage(message: string, imageBase64?: string): Promise<void> {
        if (this.isSending) return;

        this.setSending(true);
        this.inputEl.value = "";
        this.inputEl.style.height = "auto";
        this.attachedFiles = [];
        this.renderAttachedFiles();

        this.pushMessage("user", message);
        await this.renderMessages();

        this.abortController = new AbortController();
        this.setStatus("Đang suy nghĩ...");

        try {
            if (!this.onSendMessage) {
                throw new Error("onSendMessage callback not set");
            }

            await this.onSendMessage(message, imageBase64);

            this.setStatus("Sẵn sàng.");
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                this.setStatus("Đã hủy.");
            } else {
                Logger.error("ChatPanel", "Send message error:", error);
                new Notice(
                    `Lỗi: ${(error as Error).message}`
                );
                this.setStatus("Lỗi.");
            }
        } finally {
            this.setSending(false);
            this.abortController = null;
        }
    }

    /**
     * Render all messages in the chat
     */
    public async renderMessages(): Promise<void> {
        this.messagesEl.empty();

        if (this.messages.length === 0) {
            const emptyEl = this.messagesEl.createDiv({
                cls: "oca-chat-empty"
            });
            emptyEl.setText(
                "Chưa có hội thoại. Hãy gửi yêu cầu đầu tiên để trợ lý bắt đầu hỗ trợ."
            );
            return;
        }

        for (const msg of this.messages) {
            const row = this.messagesEl.createDiv({
                cls: `oca-msg oca-msg-${msg.role}`
            });
            const meta = row.createDiv({ cls: "oca-msg-meta" });

            const roleLabel =
                msg.role === "assistant"
                    ? "AI"
                    : msg.role === "user"
                        ? "Bạn"
                        : msg.role.toUpperCase();

            meta.setText(
                `${roleLabel} • ${new Date(msg.createdAt).toLocaleTimeString("vi-VN")}`
            );

            const body = row.createDiv({ cls: "oca-msg-body" });
            body.setText(msg.content);
        }

        // Scroll to bottom
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    /**
     * Add message to chat history
     */
    private pushMessage(role: ChatMessage["role"], content: string): void {
        const message: ChatMessage = {
            id: Math.random().toString(36),
            role,
            content,
            createdAt: new Date().toISOString()
        };
        this.messages.push(message);
    }

    /**
     * Set status text
     */
    private setStatus(text: string): void {
        this.statusEl.setText(text);
    }

    /**
     * Set sending state
     */
    private setSending(isSending: boolean): void {
        this.isSending = isSending;
        this.sendBtnEl.style.display = isSending ? "none" : "block";
        this.stopBtnEl.style.display = isSending ? "block" : "none";
        this.inputEl.disabled = isSending;
    }

    /**
     * Convert blob to base64
     */
    private blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Get current messages
     */
    getMessages(): ChatMessage[] {
        return this.messages;
    }

    /**
     * Get gemini history
     */
    getGeminiHistory(): GeminiContent[] {
        return this.geminiHistory;
    }

    /**
     * Set gemini history
     */
    setGeminiHistory(history: GeminiContent[]): void {
        this.geminiHistory = history;
    }

    /**
     * Add assistant message
     */
    addAssistantMessage(content: string): void {
        this.pushMessage("assistant", content);
        void this.renderMessages();
    }

    /**
     * Get abort controller for cancellation
     */
    getAbortController(): AbortController | null {
        return this.abortController;
    }
}
