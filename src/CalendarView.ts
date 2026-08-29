/**
 * CalendarView.ts
 * 
 * Orchestrator for the Calendar Agent sidebar.
 * Manages tab switching and initializes specialized panels.
 * 
 * SDD Principle: Single Responsibility - only orchestration and layout
 */

import {
    ItemView,
    Notice,
    WorkspaceLeaf
} from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import {
    ChatMessage,
    GoogleCalendarEvent,
    CalendarViewMode,
    ActiveTab
} from "./types";
import { ChatPanel } from "./ChatPanel";
import { CalendarPanel } from "./CalendarPanel";
import { TasksPanel } from "./TasksPanel";
import { DragManager } from "./DragManager";
import { MessageRenderer } from "./MessageRenderer";
import { Logger } from "./Logger";

export const CALENDAR_VIEW_TYPE = "obsidian-calendar-agent-view";

export class CalendarView extends ItemView {
    private plugin: ObsidianCalendarAgentPlugin;

    // Components
    private chatPanel!: ChatPanel;
    private calendarPanel!: CalendarPanel;
    private tasksPanel!: TasksPanel;
    private dragManager!: DragManager;
    private messageRenderer!: MessageRenderer;

    // Layout Elements
    private rootEl!: HTMLDivElement;
    private tabChatEl!: HTMLButtonElement;
    private tabCalendarEl!: HTMLButtonElement;
    private tabTasksEl!: HTMLButtonElement;
    private chatPanelEl!: HTMLDivElement;
    private calendarPanelEl!: HTMLDivElement;
    private tasksPanelEl!: HTMLDivElement;

    private activeTab: ActiveTab = "chat";

    // Shared State (Keep here for orchestration)
    private messages: ChatMessage[] = [];
    private pendingProposalFile: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianCalendarAgentPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return CALENDAR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Calendar Agent";
    }

    getIcon(): string {
        return "calendar-clock";
    }

    async onOpen(): Promise<void> {
        this.initComponents();
        this.renderLayout();
        this.restorePersistedState();
        this.switchTab("chat");
    }

    async onClose(): Promise<void> {
        this.chatPanel.cleanup();
        this.calendarPanel.cleanup();
        this.dragManager.cleanup();
        this.contentEl.empty();
    }

    /**
     * Initialize all sub-components
     */
    private initComponents(): void {
        // 1. Drag Manager
        this.dragManager = new DragManager(this.plugin);

        // 2. Message Renderer
        this.messageRenderer = new MessageRenderer({
            app: this.app,
            plugin: this.plugin,
            pendingProposalFile: this.pendingProposalFile,
            onSaveProposal: async (content, filePath) => {
                try {
                    await this.plugin.app.vault.adapter.write(filePath, content);
                    new Notice(`Đã lưu nội dung vào ${filePath}`);
                    this.pendingProposalFile = null;
                    this.messages = this.messages.filter(m => m.id !== this.lastProposalId);
                    this.pushMessage("assistant", `✅ Đã sắp xếp và lưu nội dung vào **${filePath}**.`);
                    this.chatPanel.renderMessages();
                } catch (error) {
                    new Notice(`Lỗi khi lưu file: ${(error as Error).message}`);
                }
            },
            onCancelProposal: () => {
                this.pendingProposalFile = null;
                this.messages = this.messages.filter(m => m.id !== this.lastProposalId);
                this.pushMessage("assistant", "Đã hủy đề xuất sắp xếp.");
                this.chatPanel.renderMessages();
            },
            onPushMessage: (role, content) => this.pushMessage(role, content),
            onScrollToBottom: () => {
                const el = this.chatPanelEl.querySelector(".oca-chat-messages");
                if (el) el.scrollTop = el.scrollHeight;
            }
        });

        // 3. Chat Panel
        this.chatPanel = new ChatPanel(this.plugin, this.app);

        // 4. Calendar Panel
        this.calendarPanel = new CalendarPanel(this.plugin, this.app);

        // 5. Tasks Panel
        this.tasksPanel = new TasksPanel(this.plugin, this.app);
    }

    private lastProposalId: string | null = null;

    private restorePersistedState(): void {
        // View mode persistence is handled in CalendarPanel restorePersistedState
        // Current date persistence is handled in CalendarPanel restorePersistedState
        // The CalendarView simply triggers the panel init which restores state
    }

    /**
     * Render the main layout and tab structure
     */
    private renderLayout(): void {
        const { contentEl } = this;
        contentEl.empty();

        this.rootEl = contentEl.createDiv({ cls: "oca-chat-root" });

        // Create panel containers
        this.chatPanelEl = this.rootEl.createDiv({ cls: "oca-tab-content" });
        this.calendarPanelEl = this.rootEl.createDiv({ cls: "oca-tab-content" });
        this.tasksPanelEl = this.rootEl.createDiv({ cls: "oca-tab-content" });

        // Initialize panels
        this.chatPanel.init(this.chatPanelEl, async (message, imageBase64) => {
            await this.handleSendMessage(message, imageBase64);
        });

        this.calendarPanel.init(this.calendarPanelEl, async (event, newStart, newEnd, isAllDay) => {
            await this.handleEventDrop(event, newStart, newEnd, isAllDay);
        });

        this.tasksPanel.init(this.tasksPanelEl);

        // Bottom navigation
        const bottomNav = this.rootEl.createDiv({ cls: "oca-bottom-nav" });
        this.tabChatEl = bottomNav.createEl("button", { cls: "oca-nav-btn", text: "💬 Chat" });
        this.tabCalendarEl = bottomNav.createEl("button", { cls: "oca-nav-btn", text: "📅 Calendar" });
        this.tabTasksEl = bottomNav.createEl("button", { cls: "oca-nav-btn", text: "✓ Tasks" });

        this.tabChatEl.addEventListener("click", () => this.switchTab("chat"));
        this.tabCalendarEl.addEventListener("click", () => this.switchTab("calendar"));
        this.tabTasksEl.addEventListener("click", () => this.switchTab("tasks"));
    }

    /**
     * Orchestrate tab switching
     */
    private switchTab(tab: ActiveTab): void {
        this.activeTab = tab;

        this.tabChatEl.toggleClass("active", tab === "chat");
        this.tabCalendarEl.toggleClass("active", tab === "calendar");
        this.tabTasksEl.toggleClass("active", tab === "tasks");

        this.chatPanelEl.toggleClass("active", tab === "chat");
        this.calendarPanelEl.toggleClass("active", tab === "calendar");
        this.tasksPanelEl.toggleClass("active", tab === "tasks");

        if (tab === "calendar") {
            this.calendarPanel.renderCalendarView();
        } else if (tab === "tasks") {
            this.tasksPanel.reloadTasks();
        }
    }

    /**
     * Handle AI message sending flow
     */
    private async handleSendMessage(text: string, imageBase64?: string): Promise<void> {
        try {
            const timezone = this.plugin.settings.timezone;
            const vaultSnapshot = await this.plugin.vaultContext.buildSnapshot();
            const vaultSnapshotString = JSON.stringify(vaultSnapshot, null, 2);

            const result = await this.plugin.geminiAgent.run(
                text,
                this.chatPanel.getGeminiHistory(),
                timezone,
                vaultSnapshotString,
                this.chatPanel.getAbortController()?.signal
            );

            const MAX_HISTORY_TURNS = 20;
            this.chatPanel.setGeminiHistory(result.updatedHistory.slice(-MAX_HISTORY_TURNS));

            this.pushMessage("assistant", result.assistantText || "Đã xử lý xong.");

            if (result.toolTrace.length > 0) {
                const traceText = result.toolTrace
                    .map((t, index) => {
                        const status = t.result.ok ? "OK" : `ERROR: ${t.result.error}`;
                        return `${index + 1}. ${t.toolName} → ${status}`;
                    })
                    .join("\\n");

                this.pushMessage("tool", `Tool trace:\\n${traceText}`);
            }

            await this.calendarPanel.reloadCalendarEvents();
        } catch (error) {
            Logger.error("CalendarView", "sendMessage failed", error);
            this.pushMessage("assistant", `Lỗi: ${(error as Error).message}`);
        }
    }

    /**
     * Handle event drop from drag & drop
     */
    private async handleEventDrop(
        event: GoogleCalendarEvent,
        newStart: Date,
        newEnd: Date,
        isAllDay: boolean
    ): Promise<void> {
        if (!event.id) return;

        try {
            const patch: Partial<GoogleCalendarEvent> = {};
            if (isAllDay) {
                patch.start = { date: new Date(newStart).toISOString().split("T")[0] };
                patch.end = { date: new Date(newEnd).toISOString().split("T")[0] };
            } else {
                patch.start = {
                    dateTime: new Date(newStart).toISOString(),
                    timeZone: event.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                };
                patch.end = {
                    dateTime: new Date(newEnd).toISOString(),
                    timeZone: event.end?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                };
            }

            await this.plugin.googleCalendarApi.patchEvent("primary", event.id!, patch);
            new Notice(`✓ Đã di chuyển "${event.summary || "sự kiện"}"`);
            await this.calendarPanel.reloadCalendarEvents();
        } catch (error) {
            Logger.error("CalendarView", "Event drop failed:", error);
            new Notice(`Lỗi di chuyển sự kiện: ${(error as Error).message}`);
        }
    }

    /**
     * Add message to history and trigger render
     */
    private pushMessage(role: ChatMessage["role"], content: string): void {
        const message: ChatMessage = {
            id: Math.random().toString(36),
            role,
            content,
            createdAt: new Date().toISOString()
        };
        this.messages.push(message);
        this.chatPanel.renderMessages();
    }

    /**
     * Public proxy for plugin to send a message via ChatPanel.
     * Used by main.ts scanInbox/handleInboxFile flows.
     */
    public async sendMessage(text: string, imageBase64?: string): Promise<void> {
        await this.chatPanel.sendMessage(text, imageBase64);
    }

    /**
     * Integration with plugin commands
     */
    public async processNoteProposal(): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("Không có file nào đang mở để xử lý.");
            return;
        }

        this.pendingProposalFile = activeFile.path;
        const content = await this.plugin.app.vault.read(activeFile);
        const prompt = `Hãy phân tích ghi chú này và đề xuất sắp xếp lại: \\n\\n${content}`;
        
        await this.chatPanel.sendMessage(prompt);
    }

    public async scanInbox(): Promise<void> {
        const inboxFolder = this.plugin.settings.inboxFolder;
        if (!inboxFolder) {
            new Notice("Chưa cấu hình Inbox Folder trong Settings.");
            return;
        }

        const files = this.plugin.app.vault.getFiles().filter(f => f.path.startsWith(inboxFolder));
        if (files.length === 0) {
            new Notice(`Không tìm thấy ghi chú nào trong folder: ${inboxFolder}`);
            return;
        }

        for (const file of files) {
            const content = await this.plugin.app.vault.read(file);
            const prompt = `Xử lý ghi chú từ Inbox: ${file.path}\\n\\n${content}`;
            await this.chatPanel.sendMessage(prompt);
        }
    }

    getCalendarView(): CalendarView | null {
        return this;
    }
}
