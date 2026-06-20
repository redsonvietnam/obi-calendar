import {
    ItemView,
    Notice,
    WorkspaceLeaf,
    MarkdownRenderer
} from "obsidian";
import { PromptModal } from "./PromptModal";
import type ObsidianCalendarAgentPlugin from "./main";
import {
    ChatMessage,
    GoogleCalendarEvent
} from "./types";
import { VaultContext, VaultContextSnapshot } from "./VaultContext"; // Import VaultContext and VaultContextSnapshot

export const CALENDAR_VIEW_TYPE = "obsidian-calendar-agent-view";

type ActiveTab = "chat" | "calendar" | "tasks";
type CalendarViewMode = "day" | "week" | "month" | "timeline";

interface CalendarDayCell {
    date: Date;
    key: string;
    inCurrentMonth: boolean;
    isToday: boolean;
    events: GoogleCalendarEvent[];
}

interface DragState {
    event: GoogleCalendarEvent;
    originalStartMs: number;
    originalEndMs: number;
    durationMs: number;
    offsetMinutes: number; // mouse offset from top of event in minutes
    sourceElement: HTMLElement | null;
}

const HOUR_HEIGHT = 60; // px per hour in day/week views
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const SNAP_MINUTES = 15; // snap to 15-minute intervals

/**
 * Chat + Calendar sidebar native DOM cho Obsidian.
 * Supports Day / Week / Month / Timeline views with drag & drop.
 */
import { GeminiContent } from "./types";

export class CalendarView extends ItemView {
    private plugin: ObsidianCalendarAgentPlugin;
    private messages: ChatMessage[] = [];
    private geminiHistory: GeminiContent[] = [];

    private rootEl!: HTMLDivElement;

    private tabChatEl!: HTMLButtonElement;
    private tabCalendarEl!: HTMLButtonElement;
    private tabTasksEl!: HTMLButtonElement;
    private chatPanelEl!: HTMLDivElement;
    private calendarPanelEl!: HTMLDivElement;
    private tasksPanelEl!: HTMLDivElement;

    private messagesEl!: HTMLDivElement;
    private inputEl!: HTMLTextAreaElement;
    private sendBtnEl!: HTMLButtonElement;
    private stopBtnEl!: HTMLButtonElement; // Reference to the stop button
    private statusEl!: HTMLDivElement;
    private fileInputEl!: HTMLInputElement; // Hidden file input
    private attachedFilesEl!: HTMLDivElement; // Container for attached files display
    private attachedFiles: string[] = []; // Array of file paths

    private calendarTitleEl!: HTMLHeadingElement;
    private calendarBodyEl!: HTMLDivElement;

    private activeTab: ActiveTab = "chat";
    private viewMode: CalendarViewMode = "month";
    private isSending = false;
    private isLoadingCalendar = false;
    private abortController: AbortController | null = null; // For cancelling AI requests

    private currentDate = new Date(); // anchor date for navigation
    private selectedDate = new Date();
    private calendarEvents: GoogleCalendarEvent[] = [];

    // Tasks state
    private selectedTaskListId: string = "@default";
    private taskLists: any[] = []; // Using any for now, will import GoogleTaskList if needed
    private tasks: any[] = []; // Using any for now, will import GoogleTask if needed

    private currentTimeInterval: ReturnType<typeof setInterval> | null = null;
    private pollingInterval: ReturnType<typeof setInterval> | null = null;
    private pendingProposalFile: string | null = null;

    // Drag & Drop state
    private dragState: DragState | null = null;
    private dragGhostEl: HTMLDivElement | null = null;

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
        this.renderLayout();
        this.renderMessages();
        this.setStatus("Sẵn sàng.");
        this.switchTab("chat");
        await this.reloadCalendarEvents();
        this.startPolling();
        window.addEventListener("focus", this.handleWindowFocus);
    }

    async onClose(): Promise<void> {
        if (this.currentTimeInterval) {
            clearInterval(this.currentTimeInterval);
            this.currentTimeInterval = null;
        }
        this.stopPolling();
        window.removeEventListener("focus", this.handleWindowFocus);
        this.cleanupDrag();
        this.contentEl.empty();
    }

    // ================================================================
    // LAYOUT
    // ================================================================

    private renderLayout(): void {
        const { contentEl } = this;
        contentEl.empty();

        this.rootEl = contentEl.createDiv({ cls: "oca-chat-root" });

        // Chat panel (default visible)
        this.chatPanelEl = this.rootEl.createDiv({ cls: "oca-tab-content" });
        this.calendarPanelEl = this.rootEl.createDiv({ cls: "oca-tab-content" });
        this.tasksPanelEl = this.rootEl.createDiv({ cls: "oca-tab-content" });

        this.renderChatPanel();
        this.renderCalendarPanel();
        this.renderTasksPanel();

        // Bottom navigation
        const bottomNav = this.rootEl.createDiv({ cls: "oca-bottom-nav" });
        this.tabChatEl = bottomNav.createEl("button", { cls: "oca-nav-btn", text: "💬 Chat" });
        this.tabCalendarEl = bottomNav.createEl("button", { cls: "oca-nav-btn", text: "📅 Calendar" });
        this.tabTasksEl = bottomNav.createEl("button", { cls: "oca-nav-btn", text: "✓ Tasks" });

        this.tabChatEl.addEventListener("click", () => this.switchTab("chat"));
        this.tabCalendarEl.addEventListener("click", () => this.switchTab("calendar"));
        this.tabTasksEl.addEventListener("click", () => this.switchTab("tasks"));
    }

    private renderChatPanel(): void {
        this.messagesEl = this.chatPanelEl.createDiv({ cls: "oca-chat-messages" });

        // Chat header with suggestion toggle
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

        this.statusEl = this.chatPanelEl.createDiv({ cls: "oca-chat-status" });
        this.statusEl.setText("Sẵn sàng · Gemini · Google Calendar");

        // Suggestion drawer (hidden by default)
        const drawerEl = this.chatPanelEl.createDiv({ cls: "oca-suggestion-drawer collapsed" });
        const drawerContent = drawerEl.createDiv({ cls: "oca-suggestion-drawer-content" });
        const quickBarEl = drawerContent.createDiv({ cls: "oca-quick-actions" });

        const processNoteBtn = quickBarEl.createEl("button", {
            cls: "oca-pill oca-pill-primary",
            text: "📝 Note"
        });
        processNoteBtn.title = "Xử lý Note hiện tại";
        processNoteBtn.addEventListener("click", () => {
            void this.plugin.processCurrentNote();
        });

        const scanInboxBtn = quickBarEl.createEl("button", {
            cls: "oca-pill",
            text: "📥 Inbox"
        });
        scanInboxBtn.title = "Quét và xử lý ghi chú trong Inbox";
        scanInboxBtn.addEventListener("click", () => {
            void this.plugin.scanInbox();
        });

        const quickPrompts: Array<{ label: string; prompt: string }> = [
            { label: "📅 Hôm nay", prompt: "Hãy liệt kê lịch hôm nay của tôi." },
            { label: "⏭ 5 sự kiện tới", prompt: "Hãy liệt kê 5 sự kiện sắp tới trong lịch của tôi." },
            { label: "📋 Tuần này", prompt: "Tóm tắt các sự kiện quan trọng trong tuần này." }
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

        const composerEl = this.chatPanelEl.createDiv({ cls: "oca-chat-composer" });

        // Attached files display
        this.attachedFilesEl = composerEl.createDiv({ cls: "oca-attached-files" });

        const inputWrap = composerEl.createDiv({ cls: "oca-input-wrap" });
        
        // File input (hidden)
        this.fileInputEl = inputWrap.createEl("input", {
            type: "file",
            cls: "oca-file-input"
        });
        this.fileInputEl.multiple = true;
        this.fileInputEl.style.display = "none";
        this.fileInputEl.addEventListener("change", () => this.handleFileSelection());

        // Attach button
        const attachBtn = inputWrap.createEl("button", {
            text: "📎",
            cls: "oca-chat-attach",
            title: "Đính kèm ảnh hoặc tài liệu"
        });
        attachBtn.addEventListener("click", () => {
            this.fileInputEl.click();
        });

        this.inputEl = inputWrap.createEl("textarea", {
            cls: "oca-chat-input"
        });
        this.inputEl.placeholder = "Nhập yêu cầu... (VD: Đặt lịch họp 9h sáng mai)";
        this.inputEl.rows = 1;

        this.inputEl.addEventListener("input", () => {
            this.inputEl.style.height = "auto";
            this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + "px";
        });

        this.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void this.handleSubmit();
            }
        });

        this.sendBtnEl = inputWrap.createEl("button", {
            text: "Gửi",
            cls: "mod-cta oca-chat-send"
        });
        this.sendBtnEl.addEventListener("click", () => {
            void this.handleSubmit();
        });

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

    private async handleFileSelection(): Promise<void> {
        const files = this.fileInputEl.files;
        if (!files || files.length === 0) return;

        try {
            // Ensure attachments folder exists
            const attachmentsPath = "attachments";
            try {
                await this.app.vault.getAbstractFileByPath(attachmentsPath);
            } catch (e) {
                // Folder doesn't exist, create it
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

                // Check if file exists and rename if needed
                let fileExists = true;
                while (fileExists) {
                    try {
                        await this.app.vault.getAbstractFileByPath(filePath);
                        // File exists, try next name
                        filePath = `${attachmentsPath}/${baseName}_${counter}.${extension}`;
                        counter++;
                    } catch (e) {
                        // File doesn't exist, we can use this name
                        fileExists = false;
                    }
                }

                // Read file and save to vault
                const arrayBuffer = await file.arrayBuffer();
                await this.app.vault.createBinary(filePath, arrayBuffer);
                
                console.log("[CalendarView] File uploaded:", filePath);
                
                // Add to attached files list
                if (!this.attachedFiles.includes(filePath)) {
                    this.attachedFiles.push(filePath);
                }
            }

            // Update UI
            this.renderAttachedFiles();
            new Notice(`Đã thêm ${files.length} file.`);

            // Reset file input
            this.fileInputEl.value = "";
        } catch (error) {
            console.error("[CalendarView] File upload error:", error);
            new Notice(`Lỗi tải file: ${(error as Error).message}`);
        }
    }

    private renderAttachedFiles(): void {
        this.attachedFilesEl.empty();

        if (this.attachedFiles.length === 0) {
            this.attachedFilesEl.style.display = "none";
            return;
        }

        this.attachedFilesEl.style.display = "block";
        const filesContainer = this.attachedFilesEl.createDiv({ cls: "oca-files-container" });

        for (const filePath of this.attachedFiles) {
            const chip = filesContainer.createDiv({ cls: "oca-file-chip" });

            // File icon based on extension
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

            // Remove button
            const removeBtn = chip.createEl("button", {
                text: "✕",
                cls: "oca-file-remove"
            });
            removeBtn.addEventListener("click", () => {
                this.removeAttachedFile(filePath);
            });
        }
    }

    private removeAttachedFile(filePath: string): void {
        this.attachedFiles = this.attachedFiles.filter(f => f !== filePath);
        this.renderAttachedFiles();
        new Notice(`Đã xóa: ${filePath.split("/").pop()}`);
    }

    private renderTasksPanel(): void {
        const wrap = this.tasksPanelEl.createDiv({ cls: "oca-tasks-container" });
        wrap.createEl("h4", { text: "Google Tasks" });

        const controls = wrap.createDiv({ cls: "oca-tasks-controls" });

        // Task List selection
        const listSelect = controls.createEl("select", { cls: "oca-tasks-select" });
        listSelect.addEventListener("change", async (e) => {
            const selectElement = e.target as HTMLSelectElement;
            this.selectedTaskListId = selectElement.value;
            await this.reloadTasks();
        });
        this.renderTaskListOptions(listSelect);

        // Refresh button
        const refreshBtn = controls.createEl("button", { text: "↻", cls: "oca-nav-btn" });
        refreshBtn.addEventListener("click", () => this.reloadTasks());

        // Add Task List button
        const addListBtn = controls.createEl("button", { text: "+ List", cls: "oca-nav-btn" });
        addListBtn.addEventListener("click", async () => {
            const title = await new PromptModal(this.app, "Nhập tên danh sách công việc mới:").openAndGetValue();
            if (title) {
                try {
                    await this.plugin.googleTasksApi.createTaskList(title);
                    await this.reloadTasks();
                    new Notice(`Đã tạo danh sách công việc: "${title}"`);
                } catch (error) {
                    console.error("[CalendarView] Failed to create task list:", error);
                    new Notice(`Lỗi tạo danh sách: ${(error as Error).message}`);
                }
            }
        });

        // Add Task button
        const addTaskBtn = controls.createEl("button", { text: "+ Task", cls: "oca-nav-btn" });
        addTaskBtn.addEventListener("click", async () => {
            const title = await new PromptModal(this.app, "Nhập tiêu đề công việc mới:").openAndGetValue();
            if (title && this.selectedTaskListId) {
                try {
                    await this.plugin.googleTasksApi.createTask(this.selectedTaskListId, { title });
                    await this.reloadTasks();
                    new Notice(`Đã thêm công việc: "${title}"`);
                } catch (error) {
                    console.error("[CalendarView] Failed to create task:", error);
                    new Notice(`Lỗi thêm công việc: ${(error as Error).message}`);
                }
            }
        });

        // Delete Task List button
        const deleteListBtn = controls.createEl("button", { text: "🗑️", cls: "oca-nav-btn oca-nav-btn-danger" });
        deleteListBtn.addEventListener("click", async () => {
            if (!this.selectedTaskListId || this.selectedTaskListId === "@default") {
                new Notice("Không thể xóa danh sách mặc định hoặc danh sách chưa chọn.");
                return;
            }
            const listTitle = this.taskLists.find(list => list.id === this.selectedTaskListId)?.title || this.selectedTaskListId;
            if (confirm(`Bạn có chắc chắn muốn xóa danh sách công việc "${listTitle}" không?`)) {
                try {
                    await this.plugin.googleTasksApi.deleteTaskList(this.selectedTaskListId);
                    this.selectedTaskListId = "@default"; // Reset to default
                    await this.reloadTasks();
                    new Notice(`Đã xóa danh sách công việc: "${listTitle}"`);
                } catch (error) {
                    console.error("[CalendarView] Failed to delete task list:", error);
                    new Notice(`Lỗi xóa danh sách: ${(error as Error).message}`);
                }
            }
        });


        const tasksListEl = wrap.createDiv({ cls: "oca-tasks-list" });

        // Initial render
        this.reloadTasks();
    }

    private renderTaskListOptions(selectElement: HTMLSelectElement): void {
        selectElement.empty();
        for (const list of this.taskLists) {
            const option = selectElement.createEl("option", { value: list.id, text: list.title });
            if (list.id === this.selectedTaskListId) {
                option.selected = true;
            }
        }
    }

    private async reloadTasks(): Promise<void> {
        try {
            this.taskLists = await this.plugin.googleTasksApi.listTaskLists({});
            // Ensure selectedTaskListId is valid, otherwise reset to default
            if (!this.taskLists.some(list => list.id === this.selectedTaskListId)) {
                this.selectedTaskListId = this.taskLists.length > 0 ? this.taskLists[0].id : "@default";
            }
            this.tasks = await this.plugin.googleTasksApi.listTasks({ tasklist: this.selectedTaskListId });
            this.renderTasksList();
            // Update the select element options after reloading lists
            const listSelect = this.tasksPanelEl.querySelector(".oca-tasks-select") as HTMLSelectElement;
            if (listSelect) {
                this.renderTaskListOptions(listSelect);
            }
        } catch (error) {
            console.error("[CalendarView] reloadTasks failed", error);
            new Notice(`Lỗi tải tasks: ${(error as Error).message}`);
        }
    }

    private renderTasksList(): void {
        const tasksListEl = this.tasksPanelEl.querySelector(".oca-tasks-list") as HTMLDivElement;
        if (!tasksListEl) return;
        tasksListEl.empty();

        for (const task of this.tasks) {
            const taskEl = tasksListEl.createDiv({ cls: "oca-task-item" });

            // Checkbox for completion status
            const checkbox = taskEl.createEl("input", { type: "checkbox", cls: "oca-task-checkbox" });
            checkbox.checked = task.status === "completed";
            checkbox.addEventListener("change", async () => {
                try {
                    const newStatus = checkbox.checked ? "completed" : "needsAction";
                    await this.plugin.googleTasksApi.patchTask(this.selectedTaskListId, task.id!, { status: newStatus });
                    // Update local task status immediately for responsiveness
                    task.status = newStatus;
                    new Notice(`Đã cập nhật trạng thái công việc: "${task.title}"`);
                    // Re-render to reflect changes, or just update the specific item if performance is an issue
                    this.renderTasksList(); 
                } catch (error) {
                    console.error(`[CalendarView] Failed to update task ${task.id}:`, error);
                    new Notice(`Lỗi cập nhật trạng thái: ${(error as Error).message}`);
                    // Revert checkbox if update failed
                    checkbox.checked = !checkbox.checked;
                }
            });

            // Task title and details
            const contentEl = taskEl.createDiv({ cls: "oca-task-content" });
            contentEl.createSpan({ text: task.title });
            if (task.notes) {
                contentEl.createEl("p", { cls: "oca-task-notes", text: task.notes });
            }
            if (task.due) {
                contentEl.createSpan({ cls: "oca-task-due", text: ` - Hạn chót: ${new Date(task.due).toLocaleDateString()}` });
            }

            // Edit button
            const editBtn = taskEl.createEl("button", { text: "✏️", cls: "oca-task-action-btn" });
            editBtn.addEventListener("click", async () => {
                const newTitle = await new PromptModal(this.app, "Chỉnh sửa tiêu đề công việc:", task.title).openAndGetValue();
                if (newTitle === null) return; // User cancelled

                const newNotes = await new PromptModal(this.app, "Chỉnh sửa ghi chú công việc:", task.notes || "").openAndGetValue();
                if (newNotes === null) return; // User cancelled

                const newDueStr = await new PromptModal(this.app, "Nhập hạn chót (YYYY-MM-DD) hoặc để trống:", task.due ? new Date(task.due).toISOString().split('T')[0] : "").openAndGetValue();
                if (newDueStr === null) return; // User cancelled

                const dueDate = newDueStr ? new Date(newDueStr) : undefined;
                if (newDueStr && dueDate && isNaN(dueDate.getTime())) {
                    new Notice("Định dạng ngày không hợp lệ. Vui lòng sử dụng YYYY-MM-DD.");
                    return;
                }
                // Ensure dueDate is a valid Date object before calling toISOString
                const formattedDueDate = dueDate instanceof Date && !isNaN(dueDate.getTime()) ? dueDate.toISOString() : undefined;

                try {
                    await this.plugin.googleTasksApi.updateTask(this.selectedTaskListId, task.id!, {
                        title: newTitle,
                        notes: newNotes || undefined, // Ensure undefined if empty
                        due: formattedDueDate
                    });
                    await this.reloadTasks(); // Re-render to show updated info
                    new Notice(`Đã cập nhật công việc: "${task.title}"`);
                } catch (error) {
                    console.error(`[CalendarView] Failed to update task ${task.id}:`, error);
                    new Notice(`Lỗi cập nhật công việc: ${(error as Error).message}`);
                }
            });

            // Delete button
            const deleteBtn = taskEl.createEl("button", { text: "🗑️", cls: "oca-task-action-btn oca-task-action-btn-danger" });
            deleteBtn.addEventListener("click", async () => {
                if (confirm(`Bạn có chắc chắn muốn xóa công việc "${task.title}" không?`)) {
                    try {
                        await this.plugin.googleTasksApi.deleteTask(this.selectedTaskListId, task.id!);
                        await this.reloadTasks(); // Re-render to remove the deleted task
                        new Notice(`Đã xóa công việc: "${task.title}"`);
                    } catch (error) {
                        console.error(`[CalendarView] Failed to delete task ${task.id}:`, error);
                        new Notice(`Lỗi xóa công việc: ${(error as Error).message}`);
                    }
                }
            });
        }
    }

    private renderCalendarPanel(): void {
        const wrap = this.calendarPanelEl.createDiv({ cls: "oca-calendar-container" });

        // Top bar: navigation
        const header = wrap.createDiv({ cls: "oca-calendar-header" });

        const navLeft = header.createDiv({ cls: "oca-calendar-nav oca-calendar-nav-left" });
        const prevBtn = navLeft.createEl("button", { text: "◀", cls: "oca-nav-btn" });
        const todayBtn = navLeft.createEl("button", { text: "Hôm nay", cls: "oca-nav-btn oca-nav-today" });
        const nextBtn = navLeft.createEl("button", { text: "▶", cls: "oca-nav-btn" });

        this.calendarTitleEl = header.createEl("h4", { cls: "oca-calendar-title" });

        const navRight = header.createDiv({ cls: "oca-calendar-nav oca-calendar-nav-right" });
        const reloadBtn = navRight.createEl("button", { text: "↻", cls: "oca-nav-btn" });

        prevBtn.addEventListener("click", () => this.navigatePrev());
        todayBtn.addEventListener("click", () => this.navigateToday());
        nextBtn.addEventListener("click", () => this.navigateNext());
        reloadBtn.addEventListener("click", () => {
            void this.reloadCalendarEvents();
        });

        // View mode selector
        const modeBar = wrap.createDiv({ cls: "oca-view-modes" });
        const modes: Array<{ mode: CalendarViewMode; label: string }> = [
            { mode: "day", label: "Ngày" },
            { mode: "week", label: "Tuần" },
            { mode: "month", label: "Tháng" },
            { mode: "timeline", label: "Lịch biểu" }
        ];

        for (const m of modes) {
            const btn = modeBar.createEl("button", {
                cls: "oca-view-mode-btn",
                text: m.label
            });
            btn.dataset.mode = m.mode;
            btn.addEventListener("click", () => this.setViewMode(m.mode));
        }

        // Calendar body (will be re-rendered based on mode)
        this.calendarBodyEl = wrap.createDiv({ cls: "oca-calendar-body" });

        // FAB for adding new events
        const fab = wrap.createEl("button", { cls: "oca-fab-btn" });
        fab.createSpan({ cls: "oca-fab-icon", text: "+" });
        fab.addEventListener("click", () => this.showCreateEventModal());
    }

    // ================================================================
    // TAB SWITCHING
    // ================================================================

    private switchTab(tab: ActiveTab): void {
        this.activeTab = tab;

        this.tabChatEl.toggleClass("active", tab === "chat");
        this.tabCalendarEl.toggleClass("active", tab === "calendar");
        this.tabTasksEl.toggleClass("active", tab === "tasks");
        this.chatPanelEl.toggleClass("active", tab === "chat");
        this.calendarPanelEl.toggleClass("active", tab === "calendar");
        this.tasksPanelEl.toggleClass("active", tab === "tasks");

        if (tab === "calendar") {
            this.renderCalendarView();
        } else if (tab === "tasks") {
            this.reloadTasks();
        }
    }

    private toggleSuggestionDrawer(): void {
        const drawerEl = this.chatPanelEl.querySelector(".oca-suggestion-drawer");
        if (!drawerEl) return;
        drawerEl.classList.toggle("collapsed");
        drawerEl.classList.toggle("expanded");
    }

    // ================================================================
    // VIEW MODE
    // ================================================================

    private setViewMode(mode: CalendarViewMode): void {
        this.viewMode = mode;
        this.renderCalendarView();
    }

    private renderCalendarView(): void {
        // Update mode button active states
        const modeButtons = this.calendarPanelEl.querySelectorAll(".oca-view-mode-btn");
        modeButtons.forEach((btn) => {
            const el = btn as HTMLElement;
            el.toggleClass("active", el.dataset.mode === this.viewMode);
        });

        // Update title
        this.updateCalendarTitle();

        // Clear body and render
        this.calendarBodyEl.empty();

        // Clear old time indicator interval
        if (this.currentTimeInterval) {
            clearInterval(this.currentTimeInterval);
            this.currentTimeInterval = null;
        }

        switch (this.viewMode) {
            case "day":
                this.renderDayView();
                break;
            case "week":
                this.renderWeekView();
                break;
            case "month":
                this.renderMonthView();
                break;
            case "timeline":
                this.renderTimelineView();
                break;
        }
    }

    private updateCalendarTitle(): void {
        const d = this.currentDate;
        switch (this.viewMode) {
            case "day":
                this.calendarTitleEl.setText(
                    d.toLocaleDateString("vi-VN", {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                    })
                );
                break;
            case "week": {
                const weekStart = this.getWeekStart(d);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                const fmt = (dt: Date) =>
                    dt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
                this.calendarTitleEl.setText(
                    `${fmt(weekStart)} – ${fmt(weekEnd)}, ${weekEnd.getFullYear()}`
                );
                break;
            }
            case "month":
                this.calendarTitleEl.setText(
                    d.toLocaleDateString("vi-VN", { month: "long", year: "numeric" })
                );
                break;
            case "timeline":
                this.calendarTitleEl.setText(
                    `Lịch biểu từ ${d.toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                    })}`
                );
                break;
        }
    }

    // ================================================================
    // NAVIGATION
    // ================================================================

    private navigatePrev(): void {
        switch (this.viewMode) {
            case "day":
                this.currentDate = this.addDays(this.currentDate, -1);
                break;
            case "week":
                this.currentDate = this.addDays(this.currentDate, -7);
                break;
            case "month":
                this.currentDate = new Date(
                    this.currentDate.getFullYear(),
                    this.currentDate.getMonth() - 1,
                    1
                );
                break;
            case "timeline":
                this.currentDate = this.addDays(this.currentDate, -7);
                break;
        }
        void this.reloadCalendarEvents();
    }

    private navigateNext(): void {
        switch (this.viewMode) {
            case "day":
                this.currentDate = this.addDays(this.currentDate, 1);
                break;
            case "week":
                this.currentDate = this.addDays(this.currentDate, 7);
                break;
            case "month":
                this.currentDate = new Date(
                    this.currentDate.getFullYear(),
                    this.currentDate.getMonth() + 1,
                    1
                );
                break;
            case "timeline":
                this.currentDate = this.addDays(this.currentDate, 7);
                break;
        }
        void this.reloadCalendarEvents();
    }

    private navigateToday(): void {
        this.currentDate = new Date();
        this.selectedDate = new Date();
        void this.reloadCalendarEvents();
    }

    // ================================================================
    // DRAG & DROP - Core Logic
    // ================================================================

    private makeDraggable(el: HTMLElement, event: GoogleCalendarEvent): void {
        if (!event.id) return; // Can't drag events without an ID

        el.setAttribute("draggable", "true");
        el.addClass("oca-draggable");

        el.addEventListener("dragstart", (e: DragEvent) => {
            if (!e.dataTransfer) return;

            const startMs = event.start?.dateTime
                ? new Date(event.start.dateTime).getTime()
                : event.start?.date
                    ? new Date(event.start.date + "T00:00:00").getTime()
                    : 0;

            const endMs = event.end?.dateTime
                ? new Date(event.end.dateTime).getTime()
                : event.end?.date
                    ? new Date(event.end.date + "T00:00:00").getTime()
                    : startMs + 3600000;

            // Calculate offset from top of event block in minutes (for time grid views)
            let offsetMinutes = 0;
            if (event.start?.dateTime) {
                const rect = el.getBoundingClientRect();
                const mouseY = e.clientY - rect.top;
                offsetMinutes = (mouseY / HOUR_HEIGHT) * 60;
            }

            this.dragState = {
                event,
                originalStartMs: startMs,
                originalEndMs: endMs,
                durationMs: endMs - startMs,
                offsetMinutes,
                sourceElement: el
            };

            e.dataTransfer.setData("text/plain", event.id!);
            e.dataTransfer.effectAllowed = "move";

            // Create custom drag ghost
            const ghost = document.createElement("div");
            ghost.className = "oca-drag-ghost";
            ghost.textContent = event.summary || "(Không tiêu đề)";
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 0, 0);
            this.dragGhostEl = ghost;

            // Fade the source
            setTimeout(() => {
                el.addClass("oca-dragging");
            }, 0);
        });

        el.addEventListener("dragend", () => {
            el.removeClass("oca-dragging");
            this.cleanupDrag();
        });
    }

    private cleanupDrag(): void {
        if (this.dragGhostEl) {
            this.dragGhostEl.remove();
            this.dragGhostEl = null;
        }
        // Remove all drop highlights
        document.querySelectorAll(".oca-drop-target-active").forEach((el) => {
            el.removeClass("oca-drop-target-active");
        });
        document.querySelectorAll(".oca-drag-preview").forEach((el) => el.remove());
        this.dragState = null;
    }

    private setupTimeGridDropZone(
        gridEl: HTMLElement,
        dateForColumn: Date
    ): void {
        gridEl.addEventListener("dragover", (e: DragEvent) => {
            if (!this.dragState || !e.dataTransfer) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";

            gridEl.addClass("oca-drop-target-active");

            // Show preview indicator
            const rect = gridEl.getBoundingClientRect();
            const scrollParent = gridEl.closest(".oca-timegrid-scroll, .oca-week-grid-scroll");
            const scrollTop = scrollParent ? scrollParent.scrollTop : 0;
            const mouseY = e.clientY - rect.top + scrollTop;
            const minutes = Math.max(0, Math.min(1440, (mouseY / HOUR_HEIGHT) * 60 - this.dragState.offsetMinutes));
            const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
            const previewTop = (snapped / 60) * HOUR_HEIGHT;
            const previewHeight = (this.dragState.durationMs / 3600000) * HOUR_HEIGHT;

            let preview = gridEl.querySelector(".oca-drag-preview") as HTMLDivElement | null;
            if (!preview) {
                preview = document.createElement("div");
                preview.className = "oca-drag-preview";
                gridEl.appendChild(preview);
            }
            preview.style.top = `${previewTop}px`;
            preview.style.height = `${Math.max(previewHeight, 20)}px`;

            const hrs = Math.floor(snapped / 60);
            const mins = snapped % 60;
            preview.textContent = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
        });

        gridEl.addEventListener("dragleave", (e: DragEvent) => {
            // Only remove highlight if actually leaving this element
            const relatedTarget = e.relatedTarget as HTMLElement | null;
            if (!relatedTarget || !gridEl.contains(relatedTarget)) {
                gridEl.removeClass("oca-drop-target-active");
                const preview = gridEl.querySelector(".oca-drag-preview");
                if (preview) preview.remove();
            }
        });

        gridEl.addEventListener("drop", (e: DragEvent) => {
            e.preventDefault();
            if (!this.dragState) return;

            const rect = gridEl.getBoundingClientRect();
            const scrollParent = gridEl.closest(".oca-timegrid-scroll, .oca-week-grid-scroll");
            const scrollTop = scrollParent ? scrollParent.scrollTop : 0;
            const mouseY = e.clientY - rect.top + scrollTop;
            const minutes = Math.max(0, Math.min(1440, (mouseY / HOUR_HEIGHT) * 60 - this.dragState.offsetMinutes));
            const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

            const newStart = new Date(dateForColumn);
            newStart.setHours(0, 0, 0, 0);
            newStart.setMinutes(snapped);

            const newEnd = new Date(newStart.getTime() + this.dragState.durationMs);

            void this.handleEventDrop(this.dragState.event, newStart, newEnd, false);
            this.cleanupDrag();
        });
    }

    private setupDayDropZone(
        cellEl: HTMLElement,
        targetDate: Date
    ): void {
        cellEl.addEventListener("dragover", (e: DragEvent) => {
            if (!this.dragState || !e.dataTransfer) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cellEl.addClass("oca-drop-target-active");
        });

        cellEl.addEventListener("dragleave", (e: DragEvent) => {
            const relatedTarget = e.relatedTarget as HTMLElement | null;
            if (!relatedTarget || !cellEl.contains(relatedTarget)) {
                cellEl.removeClass("oca-drop-target-active");
            }
        });

        cellEl.addEventListener("drop", (e: DragEvent) => {
            e.preventDefault();
            if (!this.dragState) return;
            cellEl.removeClass("oca-drop-target-active");

            const ev = this.dragState.event;
            const isAllDay = !!ev.start?.date;

            if (isAllDay) {
                // All-day event: just move to new date
                void this.handleEventDrop(ev, targetDate, this.addDays(targetDate, 1), true);
            } else if (ev.start?.dateTime) {
                // Timed event: keep same time, change date
                const oldStart = new Date(ev.start.dateTime);
                const newStart = new Date(targetDate);
                newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), oldStart.getSeconds(), 0);
                const newEnd = new Date(newStart.getTime() + this.dragState.durationMs);
                void this.handleEventDrop(ev, newStart, newEnd, false);
            }

            this.cleanupDrag();
        });
    }

    private async handleEventDrop(
        event: GoogleCalendarEvent,
        newStart: Date,
        newEnd: Date,
        isAllDay: boolean
    ): Promise<void> {
        if (!event.id) return;

        // Optimistic update: update local cache immediately
        const eventIndex = this.calendarEvents.findIndex((e) => e.id === event.id);
        const oldEvent = eventIndex >= 0 ? { ...this.calendarEvents[eventIndex] } : null;

        if (eventIndex >= 0) {
            if (isAllDay) {
                this.calendarEvents[eventIndex].start = {
                    date: this.toDayKey(newStart)
                };
                this.calendarEvents[eventIndex].end = {
                    date: this.toDayKey(newEnd)
                };
            } else {
                this.calendarEvents[eventIndex].start = {
                    dateTime: this.toRFC3339WithTimezone(newStart),
                    timeZone: event.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                };
                this.calendarEvents[eventIndex].end = {
                    dateTime: this.toRFC3339WithTimezone(newEnd),
                    timeZone: event.end?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                };
            }
        }

        // Re-render immediately (optimistic)
        this.renderCalendarView();

        // Call API
        try {
            const patch: Partial<GoogleCalendarEvent> = {};
            if (isAllDay) {
                patch.start = { date: this.toDayKey(newStart) };
                patch.end = { date: this.toDayKey(newEnd) };
            } else {
                patch.start = {
                    dateTime: this.toRFC3339WithTimezone(newStart),
                    timeZone: event.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                };
                patch.end = {
                    dateTime: this.toRFC3339WithTimezone(newEnd),
                    timeZone: event.end?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                };
            }

            console.log("[CalendarView] Patching event:", event.id, patch);
            const patchedEvent = await this.plugin.googleCalendarApi.patchEvent("primary", event.id!, patch);
            console.log("[CalendarView] Event patched successfully:", patchedEvent);

            new Notice(`✓ Đã di chuyển "${event.summary || "sự kiện"}"`);
        } catch (error) {
            console.error("[CalendarView] handleEventDrop failed", error);
            new Notice(`✗ Lỗi di chuyển sự kiện: ${(error as Error).message}`);

            // Rollback on error
            if (oldEvent && eventIndex >= 0) {
                this.calendarEvents[eventIndex] = oldEvent as GoogleCalendarEvent;
                this.renderCalendarView();
            }
        }
    }

    // ================================================================
    // DAY VIEW
    // ================================================================

    private renderDayView(): void {
        const container = this.calendarBodyEl.createDiv({ cls: "oca-day-view" });

        // All-day events section
        const allDayEvents = this.getEventsForDate(this.currentDate).filter(
            (e) => !!e.start?.date
        );
        if (allDayEvents.length > 0) {
            const allDaySection = container.createDiv({ cls: "oca-allday-section" });
            allDaySection.createDiv({ cls: "oca-allday-label", text: "Cả ngày" });
            const allDayList = allDaySection.createDiv({ cls: "oca-allday-events" });
            for (const ev of allDayEvents) {
                const chip = allDayList.createDiv({ cls: "oca-event-chip oca-event-allday" });
                chip.setText(ev.summary || "(Không tiêu đề)");
                chip.addEventListener("click", () => this.showEventDetail(ev));
                this.makeDraggable(chip, ev);
            }
        }

        // Time grid
        const gridWrap = container.createDiv({ cls: "oca-timegrid-scroll" });
        const grid = gridWrap.createDiv({ cls: "oca-timegrid" });
        grid.style.height = `${24 * HOUR_HEIGHT}px`;

        // Hour lines
        for (const h of HOURS) {
            const hourRow = grid.createDiv({ cls: "oca-hour-row" });
            hourRow.style.top = `${h * HOUR_HEIGHT}px`;
            hourRow.style.height = `${HOUR_HEIGHT}px`;

            const label = hourRow.createDiv({ cls: "oca-hour-label" });
            label.setText(`${String(h).padStart(2, "0")}:00`);

            hourRow.createDiv({ cls: "oca-hour-line" });
        }

        // Events column
        const eventsCol = grid.createDiv({ cls: "oca-day-events-col" });
        const timedEvents = this.getEventsForDate(this.currentDate).filter(
            (e) => !!e.start?.dateTime
        );
        this.renderTimedEventsInColumn(eventsCol, timedEvents);

        // Setup drop zone on the events column for day view
        this.setupTimeGridDropZone(eventsCol, this.currentDate);

        // Add click listener to open create event modal
        eventsCol.addEventListener("click", (e) => {
            const rect = eventsCol.getBoundingClientRect();
            const scrollParent = eventsCol.closest(".oca-timegrid-scroll");
            const scrollTop = scrollParent ? scrollParent.scrollTop : 0;
            const mouseY = e.clientY - rect.top + scrollTop;
            const minutes = Math.max(0, Math.min(1440, (mouseY / HOUR_HEIGHT) * 60));
            const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

            const hour = Math.floor(snapped / 60);
            const minute = snapped % 60;

            this.showCreateEventModal(this.currentDate, { hour, minute });
        });

        // Current time indicator
        if (this.isSameDay(this.currentDate, new Date())) {
            this.renderCurrentTimeIndicator(grid);
            this.startCurrentTimeUpdater(grid);
        }

        // Scroll to current hour or 8am
        const scrollTo = this.isSameDay(this.currentDate, new Date())
            ? Math.max(0, new Date().getHours() - 1) * HOUR_HEIGHT
            : 8 * HOUR_HEIGHT;
        setTimeout(() => {
            gridWrap.scrollTop = scrollTo;
        }, 50);
    }

    // ================================================================
    // WEEK VIEW
    // ================================================================

    private renderWeekView(): void {
        const container = this.calendarBodyEl.createDiv({ cls: "oca-week-view" });
        const weekStart = this.getWeekStart(this.currentDate);

        // Week header (day names + dates)
        const weekHeader = container.createDiv({ cls: "oca-week-header" });
        weekHeader.createDiv({ cls: "oca-week-gutter-header" }); // spacer for time column

        const days: Date[] = [];
        for (let i = 0; i < 7; i++) {
            const day = this.addDays(weekStart, i);
            days.push(day);
            const dayHeader = weekHeader.createDiv({ cls: "oca-week-day-header" });
            if (this.isSameDay(day, new Date())) dayHeader.addClass("today");

            const dayLabel = dayHeader.createDiv({ cls: "oca-week-day-label" });
            dayLabel.setText(WEEKDAY_LABELS[i]);

            const dayNum = dayHeader.createDiv({ cls: "oca-week-day-num" });
            dayNum.setText(String(day.getDate()));

            dayHeader.addEventListener("click", () => {
                this.currentDate = new Date(day);
                this.selectedDate = new Date(day);
                this.setViewMode("day");
            });
        }

        // All-day row
        const allDayRow = container.createDiv({ cls: "oca-week-allday-row" });
        allDayRow.createDiv({ cls: "oca-week-gutter", text: "Cả ngày" });
        for (let i = 0; i < 7; i++) {
            const day = days[i];
            const cell = allDayRow.createDiv({ cls: "oca-week-allday-cell" });
            const allDayEvts = this.getEventsForDate(day).filter((e) => !!e.start?.date);
            for (const ev of allDayEvts) {
                const chip = cell.createDiv({ cls: "oca-event-chip oca-event-allday" });
                chip.setText(ev.summary || "(Không tiêu đề)");
                chip.addEventListener("click", () => this.showEventDetail(ev));
                this.makeDraggable(chip, ev);
            }
            // All-day cells are drop targets for moving events between days
            this.setupDayDropZone(cell, day);
        }

        // Time grid
        const gridWrap = container.createDiv({ cls: "oca-week-grid-scroll" });
        const gridContainer = gridWrap.createDiv({ cls: "oca-week-grid-container" });

        // Time gutter
        const gutter = gridContainer.createDiv({ cls: "oca-week-time-gutter" });
        gutter.style.height = `${24 * HOUR_HEIGHT}px`;
        for (const h of HOURS) {
            const label = gutter.createDiv({ cls: "oca-hour-label" });
            label.style.top = `${h * HOUR_HEIGHT}px`;
            label.style.height = `${HOUR_HEIGHT}px`;
            label.setText(`${String(h).padStart(2, "0")}:00`);
        }

        // Day columns
        const columnsWrap = gridContainer.createDiv({ cls: "oca-week-columns" });
        columnsWrap.style.height = `${24 * HOUR_HEIGHT}px`;

        // Hour grid lines (shared)
        for (const h of HOURS) {
            const line = columnsWrap.createDiv({ cls: "oca-hour-gridline" });
            line.style.top = `${h * HOUR_HEIGHT}px`;
        }

        for (let i = 0; i < 7; i++) {
            const day = days[i];
            const col = columnsWrap.createDiv({ cls: "oca-week-day-col" });
            if (this.isSameDay(day, new Date())) col.addClass("today");

            const timedEvents = this.getEventsForDate(day).filter(
                (e) => !!e.start?.dateTime
            );
            this.renderTimedEventsInColumn(col, timedEvents);

            // Each day column is a drop zone
            this.setupTimeGridDropZone(col, day);

            // Add click listener to open create event modal
            col.addEventListener("click", (e) => {
                const rect = col.getBoundingClientRect();
                const scrollParent = col.closest(".oca-week-grid-scroll");
                const scrollTop = scrollParent ? scrollParent.scrollTop : 0;
                const mouseY = e.clientY - rect.top + scrollTop;
                const minutes = Math.max(0, Math.min(1440, (mouseY / HOUR_HEIGHT) * 60));
                const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

                const hour = Math.floor(snapped / 60);
                const minute = snapped % 60;

                this.showCreateEventModal(day, { hour, minute });
            });
        }

        // Current time indicator
        const todayIndex = days.findIndex((d) => this.isSameDay(d, new Date()));
        if (todayIndex >= 0) {
            this.renderCurrentTimeIndicator(columnsWrap, true);
            this.startCurrentTimeUpdater(columnsWrap, true);
        }

        // Scroll
        const scrollTo = this.isSameDay(this.currentDate, new Date())
            ? Math.max(0, new Date().getHours() - 1) * HOUR_HEIGHT
            : 8 * HOUR_HEIGHT;
        setTimeout(() => {
            gridWrap.scrollTop = scrollTo;
        }, 50);
    }

    // ================================================================
    // MONTH VIEW
    // ================================================================

    private renderMonthView(): void {
        const container = this.calendarBodyEl.createDiv({ cls: "oca-month-view" });

        // Weekday headers
        const weekdays = container.createDiv({ cls: "oca-calendar-weekdays" });
        for (const label of WEEKDAY_LABELS) {
            weekdays.createDiv({ cls: "oca-calendar-weekday", text: label });
        }

        // Days grid
        const daysGrid = container.createDiv({ cls: "oca-calendar-days" });
        const monthStart = new Date(
            this.currentDate.getFullYear(),
            this.currentDate.getMonth(),
            1
        );
        const cells = this.buildMonthCells(monthStart);

        for (const cell of cells) {
            const dayEl = daysGrid.createDiv({ cls: "oca-calendar-day" });

            if (!cell.inCurrentMonth) dayEl.addClass("other-month");
            if (cell.isToday) dayEl.addClass("today");
            if (this.isSameDay(cell.date, this.selectedDate)) dayEl.addClass("selected");

            dayEl.addEventListener("click", () => {
                this.currentDate = new Date(cell.date.getTime());
                this.selectedDate = new Date(cell.date.getTime());
                this.setViewMode("day");
            });

            dayEl.createDiv({
                cls: "oca-calendar-day-num",
                text: String(cell.date.getDate())
            });

            // Event chips (up to 3)
            const eventsContainer = dayEl.createDiv({ cls: "oca-calendar-day-events" });
            const maxShow = 3;
            for (let i = 0; i < Math.min(cell.events.length, maxShow); i++) {
                const ev = cell.events[i];
                const chip = eventsContainer.createDiv({ cls: "oca-month-event-chip" });
                const timeStr = ev.start?.dateTime
                    ? new Date(ev.start.dateTime).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit"
                    })
                    : "";
                chip.setText(
                    `${timeStr ? timeStr + " " : ""}${ev.summary || "(Không tiêu đề)"}`
                );
                chip.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.showEventDetail(ev);
                });
                // Make event chips draggable in month view
                this.makeDraggable(chip, ev);
            }
            if (cell.events.length > maxShow) {
                const more = eventsContainer.createDiv({ cls: "oca-month-event-more" });
                more.setText(`+${cell.events.length - maxShow} thêm`);
            }

            // Each day cell is a drop zone in month view
            this.setupDayDropZone(dayEl, cell.date);
        }
    }

    // ================================================================
    // TIMELINE / AGENDA VIEW
    // ================================================================

    private renderTimelineView(): void {
        const container = this.calendarBodyEl.createDiv({ cls: "oca-timeline-view" });
        const startDate = new Date(this.currentDate);
        startDate.setHours(0, 0, 0, 0);

        const daysToShow = 14;
        let hasAnyEvents = false;

        for (let i = 0; i < daysToShow; i++) {
            const day = this.addDays(startDate, i);
            const dayEvents = this.getEventsForDate(day);

            if (dayEvents.length === 0 && !this.isSameDay(day, new Date())) continue;

            hasAnyEvents = hasAnyEvents || dayEvents.length > 0;

            const dayGroup = container.createDiv({ cls: "oca-timeline-day" });
            if (this.isSameDay(day, new Date())) dayGroup.addClass("today");

            const dayHeader = dayGroup.createDiv({ cls: "oca-timeline-day-header" });

            const dayDate = dayHeader.createDiv({ cls: "oca-timeline-date" });
            dayDate.setText(
                day.toLocaleDateString("vi-VN", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit"
                })
            );

            if (this.isSameDay(day, new Date())) {
                const badge = dayHeader.createDiv({ cls: "oca-timeline-today-badge" });
                badge.setText("Hôm nay");
            }

            if (dayEvents.length === 0) {
                const empty = dayGroup.createDiv({ cls: "oca-timeline-empty" });
                empty.setText("Không có sự kiện");
                continue;
            }

            const eventsList = dayGroup.createDiv({ cls: "oca-timeline-events" });

            for (const event of dayEvents) {
                const eventRow = eventsList.createDiv({ cls: "oca-timeline-event" });

                const timeCol = eventRow.createDiv({ cls: "oca-timeline-event-time" });
                if (event.start?.date) {
                    timeCol.setText("Cả ngày");
                    eventRow.addClass("allday");
                } else if (event.start?.dateTime) {
                    const startTime = new Date(event.start.dateTime).toLocaleTimeString(
                        "vi-VN",
                        { hour: "2-digit", minute: "2-digit" }
                    );
                    const endTime = event.end?.dateTime
                        ? new Date(event.end.dateTime).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit"
                        })
                        : "";
                    timeCol.setText(endTime ? `${startTime} - ${endTime}` : startTime);
                }

                const infoCol = eventRow.createDiv({ cls: "oca-timeline-event-info" });
                const titleEl = infoCol.createDiv({ cls: "oca-timeline-event-title" });
                titleEl.setText(event.summary || "(Không tiêu đề)");

                if (event.location?.trim()) {
                    const locEl = infoCol.createDiv({ cls: "oca-timeline-event-location" });
                    locEl.setText(`📍 ${event.location.trim()}`);
                }

                eventRow.addEventListener("click", () => this.showEventDetail(event));

                // Make timeline events draggable
                this.makeDraggable(eventRow, event);
            }

            // Each day group is a drop zone in timeline view
            this.setupDayDropZone(dayGroup, day);
        }

        if (!hasAnyEvents) {
            const empty = container.createDiv({ cls: "oca-chat-empty" });
            empty.setText("Không có sự kiện nào trong 14 ngày tới.");
        }
    }

    // ================================================================
    // SHARED RENDERING HELPERS
    // ================================================================

    private renderTimedEventsInColumn(
        col: HTMLDivElement,
        events: GoogleCalendarEvent[]
    ): void {
        // Simple overlap handling: group overlapping events and distribute width
        const positioned = this.layoutOverlappingEvents(events);

        for (const pe of positioned) {
            const ev = pe.event;
            const block = col.createDiv({ cls: "oca-event-block" });

            const startMin = this.getMinutesOfDay(new Date(ev.start!.dateTime!));
            const endMin = ev.end?.dateTime
                ? this.getMinutesOfDay(new Date(ev.end.dateTime))
                : startMin + 60;
            const duration = Math.max(endMin - startMin, 15);

            const top = (startMin / 60) * HOUR_HEIGHT;
            const height = (duration / 60) * HOUR_HEIGHT;

            block.style.top = `${top}px`;
            block.style.height = `${Math.max(height, 20)}px`;
            block.style.left = `${pe.left}%`;
            block.style.width = `${pe.width}%`;

            const timeLabel = block.createDiv({ cls: "oca-event-block-time" });
            timeLabel.setText(
                new Date(ev.start!.dateTime!).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit"
                })
            );

            const titleLabel = block.createDiv({ cls: "oca-event-block-title" });
            titleLabel.setText(ev.summary || "(Không tiêu đề)");

            block.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showEventDetail(ev);
            });

            // Make event blocks draggable in day/week views
            this.makeDraggable(block, ev);
        }
    }

    private layoutOverlappingEvents(
        events: GoogleCalendarEvent[]
    ): Array<{ event: GoogleCalendarEvent; left: number; width: number }> {
        if (events.length === 0) return [];

        const items = events
            .map((ev) => ({
                event: ev,
                start: ev.start?.dateTime ? this.getMinutesOfDay(new Date(ev.start.dateTime)) : 0,
                end: ev.end?.dateTime
                    ? this.getMinutesOfDay(new Date(ev.end.dateTime))
                    : (ev.start?.dateTime ? this.getMinutesOfDay(new Date(ev.start.dateTime)) + 60 : 60)
            }))
            .sort((a, b) => a.start - b.start || a.end - b.end);

        const result: Array<{ event: GoogleCalendarEvent; left: number; width: number }> = [];
        const groups: typeof items[] = [];

        // Group overlapping events
        let currentGroup: typeof items = [];
        let groupEnd = -1;

        for (const item of items) {
            if (currentGroup.length === 0 || item.start < groupEnd) {
                currentGroup.push(item);
                groupEnd = Math.max(groupEnd, item.end);
            } else {
                groups.push(currentGroup);
                currentGroup = [item];
                groupEnd = item.end;
            }
        }
        if (currentGroup.length > 0) groups.push(currentGroup);

        for (const group of groups) {
            const count = group.length;
            const widthPer = 100 / count;
            for (let i = 0; i < group.length; i++) {
                result.push({
                    event: group[i].event,
                    left: i * widthPer,
                    width: widthPer - 1 // 1% gap
                });
            }
        }

        return result;
    }

    private renderCurrentTimeIndicator(container: HTMLDivElement, isWeekView = false): void {
        const existing = container.querySelector(".oca-current-time-line");
        if (existing) existing.remove();

        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();
        const top = (minutes / 60) * HOUR_HEIGHT;

        const line = container.createDiv({ cls: "oca-current-time-line" });
        line.style.top = `${top}px`;
    }

    private startCurrentTimeUpdater(container: HTMLDivElement, isWeekView = false): void {
        this.currentTimeInterval = setInterval(() => {
            this.renderCurrentTimeIndicator(container, isWeekView);
        }, 60000); // update every minute
    }

    // ================================================================
    // EVENT DETAIL POPUP
    // ================================================================

    private showEventDetail(event: GoogleCalendarEvent): void {
        // Don't show detail if we're dragging
        if (this.dragState) return;

        // Remove any existing modal
        const existingModal = document.querySelector(".oca-modal-overlay");
        if (existingModal) existingModal.remove();

        const overlay = document.body.createDiv({ cls: "oca-modal-overlay" });
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const modal = overlay.createDiv({ cls: "oca-modal-content" });

        const header = modal.createDiv({ cls: "oca-modal-header" });
        header.createEl("h3", {
            cls: "oca-modal-title",
            text: event.summary || "(Không tiêu đề)"
        });
        const closeBtn = header.createEl("button", { cls: "oca-modal-close", text: "✕" });
        closeBtn.addEventListener("click", () => overlay.remove());

        // Time
        const timeField = modal.createDiv({ cls: "oca-modal-field" });
        timeField.createDiv({ cls: "oca-modal-field-label", text: "🕐 Thời gian" });
        const timeValue = timeField.createDiv({ cls: "oca-modal-field-value" });
        if (event.start?.date) {
            timeValue.setText("Cả ngày");
        } else if (event.start?.dateTime) {
            const start = new Date(event.start.dateTime).toLocaleString("vi-VN");
            const end = event.end?.dateTime
                ? new Date(event.end.dateTime).toLocaleString("vi-VN")
                : "";
            timeValue.setText(end ? `${start} → ${end}` : start);
        }

        // Location
        if (event.location?.trim()) {
            const locField = modal.createDiv({ cls: "oca-modal-field" });
            locField.createDiv({ cls: "oca-modal-field-label", text: "📍 Địa điểm" });
            locField.createDiv({ cls: "oca-modal-field-value", text: event.location.trim() });
        }

        // Description
        if (event.description?.trim()) {
            const descField = modal.createDiv({ cls: "oca-modal-field" });
            descField.createDiv({ cls: "oca-modal-field-label", text: "📝 Mô tả" });
            const descValue = descField.createDiv({ cls: "oca-modal-field-value" });
            descValue.setText(event.description.trim());
        }

        // Attendees
        if (event.attendees && event.attendees.length > 0) {
            const attField = modal.createDiv({ cls: "oca-modal-field" });
            attField.createDiv({ cls: "oca-modal-field-label", text: "👥 Người tham dự" });
            const attList = attField.createDiv({ cls: "oca-modal-field-value" });
            attList.setText(
                event.attendees
                    .map((a) => a.displayName || a.email)
                    .join(", ")
            );
        }

        // Link
        if (event.htmlLink) {
            const linkField = modal.createDiv({ cls: "oca-modal-field" });
            const link = linkField.createEl("a", {
                text: "Mở trong Google Calendar ↗",
                href: event.htmlLink
            });
            link.style.color = "var(--interactive-accent)";
            link.style.fontSize = "13px";
        }

        // Add Edit button
        const footer = modal.createDiv({ cls: "oca-modal-buttons" });
        const editBtn = footer.createEl("button", { cls: "oca-modal-btn primary", text: "Chỉnh sửa" });
        editBtn.addEventListener("click", () => {
            overlay.remove(); // Close detail modal
            this.showEditEventModal(event); // Open edit modal
        });
    }

    private showCreateEventModal(initialDate?: Date, initialTime?: { hour: number; minute: number }): void {
        const existingModal = document.querySelector(".oca-modal-overlay");
        if (existingModal) existingModal.remove();

        const overlay = document.body.createDiv({ cls: "oca-modal-overlay" });
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const modal = overlay.createDiv({ cls: "oca-modal-content" });

        const header = modal.createDiv({ cls: "oca-modal-header" });
        header.createEl("h3", { cls: "oca-modal-title", text: "Tạo sự kiện mới" });
        const closeBtn = header.createEl("button", { cls: "oca-modal-close", text: "✕" });
        closeBtn.addEventListener("click", () => overlay.remove());

        // Form fields
        const titleField = modal.createDiv({ cls: "oca-modal-field" });
        titleField.createDiv({ cls: "oca-modal-field-label", text: "Tiêu đề" });
        const titleInput = titleField.createEl("input", { cls: "oca-modal-input", type: "text" });
        titleInput.placeholder = "Thêm tiêu đề";

        const dateRow = modal.createDiv({ cls: "oca-modal-row" });
        const startDateField = dateRow.createDiv({ cls: "oca-modal-field" });
        startDateField.createDiv({ cls: "oca-modal-field-label", text: "Ngày bắt đầu" });
        const startDateInput = startDateField.createEl("input", { cls: "oca-modal-input", type: "date" });

        const endDateField = dateRow.createDiv({ cls: "oca-modal-field" });
        endDateField.createDiv({ cls: "oca-modal-field-label", text: "Ngày kết thúc" });
        const endDateInput = endDateField.createEl("input", { cls: "oca-modal-input", type: "date" });

        const timeRow = modal.createDiv({ cls: "oca-modal-row" });
        const startTimeField = timeRow.createDiv({ cls: "oca-modal-field" });
        startTimeField.createDiv({ cls: "oca-modal-field-label", text: "Giờ bắt đầu" });
        const startTimeInput = startTimeField.createEl("input", { cls: "oca-modal-input", type: "time" });

        const endTimeField = timeRow.createDiv({ cls: "oca-modal-field" });
        endTimeField.createDiv({ cls: "oca-modal-field-label", text: "Giờ kết thúc" });
        const endTimeInput = endTimeField.createEl("input", { cls: "oca-modal-input", type: "time" });

        const allDayField = modal.createDiv({ cls: "oca-modal-field" });
        const allDayCheckbox = allDayField.createEl("input", { type: "checkbox" });
        allDayField.createEl("label", { text: "Cả ngày" }).prepend(allDayCheckbox);

        const locationField = modal.createDiv({ cls: "oca-modal-field" });
        locationField.createDiv({ cls: "oca-modal-field-label", text: "Địa điểm" });
        const locationInput = locationField.createEl("input", { cls: "oca-modal-input", type: "text" });
        locationInput.placeholder = "Thêm địa điểm";

        const descriptionField = modal.createDiv({ cls: "oca-modal-field" });
        descriptionField.createDiv({ cls: "oca-modal-field-label", text: "Mô tả" });
        const descriptionInput = descriptionField.createEl("textarea", { cls: "oca-modal-textarea" });
        descriptionInput.rows = 3;
        descriptionInput.placeholder = "Thêm mô tả";

        // Set initial values
        const now = new Date();
        const initialStartDate = initialDate || now;
        const initialStartTime = initialTime || { hour: now.getHours(), minute: Math.floor(now.getMinutes() / SNAP_MINUTES) * SNAP_MINUTES };

        startDateInput.value = this.toDayKey(initialStartDate);
        endDateInput.value = this.toDayKey(initialStartDate);
        startTimeInput.value = `${String(initialStartTime.hour).padStart(2, "0")}:${String(initialStartTime.minute).padStart(2, "0")}`;
        endTimeInput.value = `${String(initialStartTime.hour + 1).padStart(2, "0")}:${String(initialStartTime.minute).padStart(2, "0")}`;

        const toggleTimeInputs = (disable: boolean) => {
            startTimeInput.disabled = disable;
            endTimeInput.disabled = disable;
        };

        allDayCheckbox.addEventListener("change", () => {
            toggleTimeInputs(allDayCheckbox.checked);
        });
        toggleTimeInputs(allDayCheckbox.checked); // Initial state

        // Buttons
        const buttons = modal.createDiv({ cls: "oca-modal-buttons" });
        const cancelBtn = buttons.createEl("button", { cls: "oca-modal-btn", text: "Hủy" });
        cancelBtn.addEventListener("click", () => overlay.remove());

        const createBtn = buttons.createEl("button", { cls: "oca-modal-btn primary", text: "Tạo sự kiện" });
        createBtn.addEventListener("click", async () => {
            const summary = titleInput.value.trim();
            if (!summary) {
                new Notice("Tiêu đề sự kiện không được rỗng.");
                return;
            }

            const isAllDay = allDayCheckbox.checked;
            const startDateTime = new Date(`${startDateInput.value}T${startTimeInput.value}:00`);
            const endDateTime = new Date(`${endDateInput.value}T${endTimeInput.value}:00`);

            const newEvent: GoogleCalendarEvent = {
                summary,
                location: locationInput.value.trim() || undefined,
                description: descriptionInput.value.trim() || undefined,
                start: isAllDay ? { date: startDateInput.value } : { dateTime: startDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                end: isAllDay ? { date: endDateInput.value } : { dateTime: endDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            };

            try {
                console.log("[CalendarView] Creating event with payload:", newEvent);
                const createdEvent = await this.plugin.googleCalendarApi.createEvent("primary", newEvent);
                console.log("[CalendarView] Event created successfully:", createdEvent);
                new Notice(`✓ Đã tạo sự kiện "${summary}"`);
                overlay.remove();
                await this.reloadCalendarEvents();
            } catch (error) {
                console.error("[CalendarView] createEvent failed", error);
                new Notice(`✗ Lỗi tạo sự kiện: ${(error as Error).message}`);
            }
        });
    }

    private showEditEventModal(event: GoogleCalendarEvent): void {
        if (!event.id) {
            new Notice("Không thể chỉnh sửa sự kiện không có ID.");
            return;
        }

        const existingModal = document.querySelector(".oca-modal-overlay");
        if (existingModal) existingModal.remove();

        const overlay = document.body.createDiv({ cls: "oca-modal-overlay" });
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const modal = overlay.createDiv({ cls: "oca-modal-content" });

        const header = modal.createDiv({ cls: "oca-modal-header" });
        header.createEl("h3", { cls: "oca-modal-title", text: "Chỉnh sửa sự kiện" });
        const closeBtn = header.createEl("button", { cls: "oca-modal-close", text: "✕" });
        closeBtn.addEventListener("click", () => overlay.remove());

        // Form fields
        const titleField = modal.createDiv({ cls: "oca-modal-field" });
        titleField.createDiv({ cls: "oca-modal-field-label", text: "Tiêu đề" });
        const titleInput = titleField.createEl("input", { cls: "oca-modal-input", type: "text" });
        titleInput.placeholder = "Thêm tiêu đề";

        const dateRow = modal.createDiv({ cls: "oca-modal-row" });
        const startDateField = dateRow.createDiv({ cls: "oca-modal-field" });
        startDateField.createDiv({ cls: "oca-modal-field-label", text: "Ngày bắt đầu" });
        const startDateInput = startDateField.createEl("input", { cls: "oca-modal-input", type: "date" });

        const endDateField = dateRow.createDiv({ cls: "oca-modal-field" });
        endDateField.createDiv({ cls: "oca-modal-field-label", text: "Ngày kết thúc" });
        const endDateInput = endDateField.createEl("input", { cls: "oca-modal-input", type: "date" });

        const timeRow = modal.createDiv({ cls: "oca-modal-row" });
        const startTimeField = timeRow.createDiv({ cls: "oca-modal-field" });
        startTimeField.createDiv({ cls: "oca-modal-field-label", text: "Giờ bắt đầu" });
        const startTimeInput = startTimeField.createEl("input", { cls: "oca-modal-input", type: "time" });

        const endTimeField = timeRow.createDiv({ cls: "oca-modal-field" });
        endTimeField.createDiv({ cls: "oca-modal-field-label", text: "Giờ kết thúc" });
        const endTimeInput = endTimeField.createEl("input", { cls: "oca-modal-input", type: "time" });

        const allDayField = modal.createDiv({ cls: "oca-modal-field" });
        const allDayCheckbox = allDayField.createEl("input", { type: "checkbox" });
        allDayField.createEl("label", { text: "Cả ngày" }).prepend(allDayCheckbox);

        const locationField = modal.createDiv({ cls: "oca-modal-field" });
        locationField.createDiv({ cls: "oca-modal-field-label", text: "Địa điểm" });
        const locationInput = locationField.createEl("input", { cls: "oca-modal-input", type: "text" });
        locationInput.placeholder = "Thêm địa điểm";

        const descriptionField = modal.createDiv({ cls: "oca-modal-field" });
        descriptionField.createDiv({ cls: "oca-modal-field-label", text: "Mô tả" });
        const descriptionInput = descriptionField.createEl("textarea", { cls: "oca-modal-textarea" });
        descriptionInput.rows = 3;
        descriptionInput.placeholder = "Thêm mô tả";

        // Pre-fill values from existing event
        titleInput.value = event.summary || "";
        locationInput.value = event.location || "";
        descriptionInput.value = event.description || "";

        const isAllDayEvent = !!event.start?.date;
        allDayCheckbox.checked = isAllDayEvent;

        if (isAllDayEvent) {
            startDateInput.value = event.start?.date || "";
            endDateInput.value = event.end?.date || "";
        } else if (event.start?.dateTime && event.end?.dateTime) {
            const startDt = new Date(event.start.dateTime);
            const endDt = new Date(event.end.dateTime);

            startDateInput.value = this.toDayKey(startDt);
            endDateInput.value = this.toDayKey(endDt);
            startTimeInput.value = `${String(startDt.getHours()).padStart(2, "0")}:${String(startDt.getMinutes()).padStart(2, "0")}`;
            endTimeInput.value = `${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}`;
        }

        const toggleTimeInputs = (disable: boolean) => {
            startTimeInput.disabled = disable;
            endTimeInput.disabled = disable;
        };

        allDayCheckbox.addEventListener("change", () => {
            toggleTimeInputs(allDayCheckbox.checked);
        });
        toggleTimeInputs(allDayCheckbox.checked); // Initial state

        // Buttons
        const buttons = modal.createDiv({ cls: "oca-modal-buttons" });
        const cancelBtn = buttons.createEl("button", { cls: "oca-modal-btn", text: "Hủy" });
        cancelBtn.addEventListener("click", () => overlay.remove());

        const updateBtn = buttons.createEl("button", { cls: "oca-modal-btn primary", text: "Cập nhật sự kiện" });
        updateBtn.addEventListener("click", async () => {
            const summary = titleInput.value.trim();
            if (!summary) {
                new Notice("Tiêu đề sự kiện không được rỗng.");
                return;
            }

            const isAllDay = allDayCheckbox.checked;
            const startDateTime = new Date(`${startDateInput.value}T${startTimeInput.value}:00`);
            const endDateTime = new Date(`${endDateInput.value}T${endTimeInput.value}:00`);

            const updatedEvent: Partial<GoogleCalendarEvent> = {
                summary,
                location: locationInput.value.trim() || undefined,
                description: descriptionInput.value.trim() || undefined,
                start: isAllDay ? { date: startDateInput.value } : { dateTime: startDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                end: isAllDay ? { date: endDateInput.value } : { dateTime: endDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            };

            try {
                console.log("[CalendarView] Patching event with payload:", event.id, updatedEvent);
                const patchedEvent = await this.plugin.googleCalendarApi.patchEvent("primary", event.id!, updatedEvent);
                console.log("[CalendarView] Event patched successfully:", patchedEvent);
                new Notice(`✓ Đã cập nhật sự kiện "${summary}"`);
                overlay.remove();
                await this.reloadCalendarEvents();
            } catch (error) {
                console.error("[CalendarView] patchEvent failed", error);
                new Notice(`✗ Lỗi cập nhật sự kiện: ${(error as Error).message}`);
            }
        });
    }

    // ================================================================
    // DATA LOADING
    // ================================================================

    private async reloadCalendarEvents(): Promise<void> {
        if (this.isLoadingCalendar) return;
        this.isLoadingCalendar = true;

        try {
            const range = this.getDateRange();

            this.calendarEvents = await this.plugin.googleCalendarApi.listEvents({
                timeMin: range.start.toISOString(),
                timeMax: range.end.toISOString(),
                maxResults: 500,
                singleEvents: true,
                orderBy: "startTime"
            });
        } catch (error) {
            console.error("[CalendarView] reloadCalendarEvents failed", error);
            new Notice(`Không tải được dữ liệu calendar: ${(error as Error).message}`);
            this.calendarEvents = [];
        } finally {
            this.isLoadingCalendar = false;
            this.renderCalendarView();
        }
    }

    private getDateRange(): { start: Date; end: Date } {
        const d = this.currentDate;
        switch (this.viewMode) {
            case "day":
                return {
                    start: new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1),
                    end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2)
                };
            case "week": {
                const ws = this.getWeekStart(d);
                return {
                    start: new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 1),
                    end: new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 8)
                };
            }
            case "month":
                return {
                    start: new Date(d.getFullYear(), d.getMonth() - 1, 1),
                    end: new Date(d.getFullYear(), d.getMonth() + 2, 0, 23, 59, 59)
                };
            case "timeline":
                return {
                    start: new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1),
                    end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 15)
                };
            default:
                return {
                    start: new Date(d.getFullYear(), d.getMonth() - 1, 1),
                    end: new Date(d.getFullYear(), d.getMonth() + 2, 0, 23, 59, 59)
                };
        }
    }

    // ================================================================
    // CHAT METHODS (unchanged)
    // ================================================================

    private async renderMessages(): Promise<void> {
        this.messagesEl.empty();

        if (this.messages.length === 0) {
            const emptyEl = this.messagesEl.createDiv({ cls: "oca-chat-empty" });
            emptyEl.setText("Chưa có hội thoại. Hãy gửi yêu cầu đầu tiên để trợ lý bắt đầu hỗ trợ.");
            return;
        }

        for (const msg of this.messages) {
            const row = this.messagesEl.createDiv({ cls: `oca-msg oca-msg-${msg.role}` });
            const meta = row.createDiv({ cls: "oca-msg-meta" });

            const roleLabel =
                msg.role === "assistant"
                    ? "AI"
                    : msg.role === "user"
                        ? "Bạn"
                        : msg.role.toUpperCase();

            meta.setText(`${roleLabel} • ${new Date(msg.createdAt).toLocaleTimeString("vi-VN")}`);

            if (msg.role === "proposal") {
                row.classList.add("oca-msg-proposal");
                const body = row.createDiv({ cls: "oca-msg-body" });

                // Collapsible header bar
                const header = body.createDiv({ cls: "oca-proposal-header" });
                const toggleIcon = header.createSpan({ cls: "oca-proposal-toggle", text: "▼" });
                header.createSpan({ cls: "oca-proposal-title", text: "Đề xuất từ AI" });

                const preview = header.createSpan({ cls: "oca-proposal-preview" });
                const plainPreview = msg.content.replace(/\n+/g, " ").slice(0, 80);
                preview.setText(plainPreview + (msg.content.length > 80 ? "…" : ""));

                const actions = header.createDiv({ cls: "oca-proposal-header-actions" });
                const saveSmall = actions.createEl("button", { cls: "oca-pill oca-pill-primary", text: "Lưu" });
                const cancelSmall = actions.createEl("button", { cls: "oca-pill", text: "Hủy" });

                // Collapsible content
                const contentWrap = body.createDiv({ cls: "oca-proposal-content" });
                const innerWrap = contentWrap.createDiv({ cls: "oca-proposal-inner" });
                const textarea = innerWrap.createEl("textarea", {
                    cls: "oca-proposal-textarea"
                });
                textarea.value = msg.content;

                const btnContainer = innerWrap.createDiv({ cls: "oca-proposal-buttons" });
                const saveBtn = btnContainer.createEl("button", {
                    cls: "mod-cta oca-proposal-save",
                    text: "Sắp xếp & Lưu"
                });
                const cancelBtn = btnContainer.createEl("button", {
                    cls: "oca-proposal-cancel",
                    text: "Hủy bỏ"
                });

                // Toggle expand/collapse
                const toggleExpand = () => {
                    const isCollapsed = contentWrap.classList.contains("collapsed");
                    contentWrap.classList.toggle("collapsed");
                    toggleIcon.textContent = isCollapsed ? "▼" : "▶";
                    if (!isCollapsed) {
                        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
                    }
                };
                header.addEventListener("click", (e) => {
                    if (!(e.target as HTMLElement).closest("button")) toggleExpand();
                });
                toggleIcon.addEventListener("click", (e) => {
                    e.stopPropagation();
                    toggleExpand();
                });

                // Save from header button
                const doSave = async () => {
                    const editedContent = textarea.value;
                    const filePath = this.pendingProposalFile;
                    if (!filePath) return;
                    try {
                        await this.plugin.app.vault.adapter.write(filePath, editedContent);
                        new Notice(`Đã lưu nội dung đã sắp xếp vào ${filePath}`);
                        this.pendingProposalFile = null;
                        this.messages = this.messages.filter(m => m.id !== msg.id);
                        this.pushMessage("assistant",
                            `✅ Đã sắp xếp và lưu nội dung vào **${filePath}**.`
                        );
                    } catch (error) {
                        new Notice(`Lỗi khi lưu file: ${(error as Error).message}`);
                    }
                };
                saveBtn.addEventListener("click", doSave);
                saveSmall.addEventListener("click", (e) => { e.stopPropagation(); doSave(); });

                // Cancel
                const doCancel = () => {
                    this.pendingProposalFile = null;
                    this.messages = this.messages.filter(m => m.id !== msg.id);
                    this.pushMessage("assistant", "Đã hủy đề xuất sắp xếp.");
                };
                cancelBtn.addEventListener("click", doCancel);
                cancelSmall.addEventListener("click", (e) => { e.stopPropagation(); doCancel(); });
            } else {
                const body = row.createDiv({ cls: "oca-msg-body" });
                await MarkdownRenderer.render(
                    this.plugin.app,
                    msg.content,
                    body,
                    '',
                    this
                );
            }
        }

        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    private async handleSubmit(): Promise<void> {
        const text = this.inputEl.value.trim();
        if (!text && this.attachedFiles.length === 0) return;

        this.inputEl.value = "";

        // Build message with attached files info
        let fullMessage = text;
        if (this.attachedFiles.length > 0) {
            const fileList = this.attachedFiles.map(f => f.split("/").pop()).join(", ");
            fullMessage += `\n\n[Đính kèm: ${fileList}]`;
        }

        await this.sendMessage(fullMessage);

        // Clear attached files after sending
        this.attachedFiles = [];
        this.renderAttachedFiles();
    }

    public async sendMessage(text: string): Promise<void> {
        if (this.isSending) {
            new Notice("Đang xử lý yêu cầu trước đó. Vui lòng đợi.");
            return;
        }

        this.pushMessage("user", text);
        this.setSending(true);

        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            const timezone = this.plugin.settings.timezone; // Get timezone from settings
            const vaultSnapshot = await this.plugin.vaultContext.buildSnapshot(); // Build vault snapshot
            const vaultSnapshotString = JSON.stringify(vaultSnapshot, null, 2); // Stringify for prompt

            const result = await this.plugin.geminiAgent.run(
                text,
                this.geminiHistory,
                timezone,
                vaultSnapshotString,
                signal
            );

            const MAX_HISTORY_TURNS = 20;
            this.geminiHistory = result.updatedHistory.slice(-MAX_HISTORY_TURNS);

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
            await this.reloadCalendarEvents();
        } catch (error) {
            const message = (error as Error).message;
            console.error("[CalendarView] sendMessage failed", error);
            this.pushMessage("assistant", `Lỗi: ${message}`);
            this.setStatus("Có lỗi khi gọi Gemini.");
        } finally {
            this.setSending(false);
        }
    }

    /**
     * Xử lý Note hiện tại dưới dạng đề xuất (proposal):
     * AI phân tích, trả về nội dung đã sắp xếp nhưng KHÔNG ghi file.
     * Người dùng có thể chỉnh sửa và bấm "Sắp xếp & Lưu" để ghi đè file.
     */
    public async processNoteProposal(): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("Không có file nào đang mở để xử lý.");
            return;
        }
        if (this.isSending) {
            new Notice("Đang xử lý yêu cầu trước đó. Vui lòng đợi.");
            return;
        }

        const content = await this.plugin.app.vault.read(activeFile);
        const filePath = activeFile.path;

        const prompt = [
            `Tôi muốn bạn giúp tôi "dọn dẹp" và tổ chức lại ghi chú này.`,
            `File: ${filePath}`,
            `Nội dung hiện tại:`,
            `---`,
            content,
            `---`,
            `Yêu cầu:`,
            `1. Phân tích nội dung hỗn loạn trên để trích xuất các sự kiện (Calendar) và công việc (Tasks).`,
            `2. Đưa các sự kiện vào Google Calendar và các công việc vào Google Tasks.`,
            `3. Đề xuất nội dung ghi chú đã được sắp xếp lại một cách khoa học trong TEXT RESPONSE của bạn. Hãy output nội dung markdown đã tổ chức lại (chia mục, dùng checklist, định dạng ngày tháng) để tôi duyệt trước khi ghi đè.`,
            `4. KHÔNG dùng write_vault_note hay append_vault_note. Tôi sẽ tự quyết định ghi đè sau khi duyệt đề xuất của bạn.`,
            `5. Nếu có nhiều sự kiện/task, hãy liệt kê danh sách và hỏi xác nhận trước khi tạo hàng loạt.`,
            `6. Sau khi hoàn tất, tóm tắt những gì đã đồng bộ lên Google và đề xuất thay đổi cho file.`
        ].join('\n');

        this.pushMessage("user", `📋 **Yêu cầu xử lý**: \`${filePath}\``);
        this.setSending(true);
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            const timezone = this.plugin.settings.timezone;
            const vaultSnapshot = await this.plugin.vaultContext.buildSnapshot();
            const vaultSnapshotString = JSON.stringify(vaultSnapshot, null, 2);

            const result = await this.plugin.geminiAgent.run(
                prompt,
                this.geminiHistory,
                timezone,
                vaultSnapshotString,
                signal,
                ["write_vault_note", "append_vault_note"]
            );

            const MAX_HISTORY_TURNS = 20;
            this.geminiHistory = result.updatedHistory.slice(-MAX_HISTORY_TURNS);

            const proposalText = result.assistantText || "Đã xử lý xong.";

            // Show editable proposal
            this.showProposal(proposalText, filePath);

            if (result.toolTrace.length > 0) {
                const traceText = result.toolTrace
                    .map((t, index) => {
                        const status = t.result.ok ? "OK" : `ERROR: ${t.result.error}`;
                        return `${index + 1}. ${t.toolName} → ${status}`;
                    })
                    .join("\n");
                this.pushMessage("tool", `Tool trace:\n${traceText}`);
            }

            this.setStatus("Đã nhận đề xuất. Hãy chỉnh sửa và bấm 'Sắp xếp & Lưu' nếu ưng ý.");
            await this.reloadCalendarEvents();
        } catch (error) {
            const message = (error as Error).message;
            console.error("[CalendarView] processNoteProposal failed", error);
            this.pushMessage("assistant", `Lỗi: ${message}`);
            this.setStatus("Có lỗi khi gọi Gemini.");
        } finally {
            this.setSending(false);
        }
    }

    /**
     * Hiển thị đề xuất AI trong textarea có thể chỉnh sửa + nút hành động.
     */
    private showProposal(content: string, filePath: string): void {
        this.pendingProposalFile = filePath;
        this.messages.push({
            id: `proposal-${Date.now()}`,
            role: "proposal",
            content: content,
            createdAt: new Date().toISOString()
        });
        this.renderMessages();
    }

    private setSending(isSending: boolean): void {
        this.isSending = isSending;
        this.sendBtnEl.disabled = isSending;
        this.inputEl.disabled = isSending;
        if (this.stopBtnEl) {
            this.stopBtnEl.style.display = isSending ? "inline-block" : "none";
        }
        this.setStatus(isSending ? "Đang xử lý..." : "Sẵn sàng.");
    }

    private setStatus(text: string): void {
        if (this.statusEl) {
            this.statusEl.setText(text);
        }
    }

    private pushMessage(role: ChatMessage["role"], content: string): void {
        this.messages.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            role,
            content,
            createdAt: new Date().toISOString()
        });
        this.renderMessages();
    }

    // ================================================================
    // UTILITY METHODS
    // ================================================================

    private buildMonthCells(monthDate: Date): CalendarDayCell[] {
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const firstOfMonth = new Date(year, month, 1);
        const lastOfMonth = new Date(year, month + 1, 0);

        const mondayFirst = (firstOfMonth.getDay() + 6) % 7;
        const gridStart = new Date(year, month, 1 - mondayFirst);

        const totalDays = 42;
        const cells: CalendarDayCell[] = [];
        const eventsMap = this.groupEventsByDay();

        for (let i = 0; i < totalDays; i += 1) {
            const day = new Date(
                gridStart.getFullYear(),
                gridStart.getMonth(),
                gridStart.getDate() + i
            );
            const key = this.toDayKey(day);

            cells.push({
                date: day,
                key,
                inCurrentMonth: day >= firstOfMonth && day <= lastOfMonth,
                isToday: this.isSameDay(day, new Date()),
                events: eventsMap.get(key) ?? []
            });
        }

        return cells;
    }

    private getEventsForDate(date: Date): GoogleCalendarEvent[] {
        const dayKey = this.toDayKey(date);
        return this.calendarEvents.filter(
            (event) => this.toDayKeyFromEvent(event) === dayKey
        );
    }

    private groupEventsByDay(): Map<string, GoogleCalendarEvent[]> {
        const map = new Map<string, GoogleCalendarEvent[]>();

        for (const event of this.calendarEvents) {
            const key = this.toDayKeyFromEvent(event);
            if (!key) continue;

            const list = map.get(key) ?? [];
            list.push(event);
            map.set(key, list);
        }

        return map;
    }

    private toDayKeyFromEvent(event: GoogleCalendarEvent): string {
        const start = event.start?.dateTime ?? event.start?.date;
        if (!start) return "";

        if (event.start?.date) {
            return event.start.date;
        }

        const dt = new Date(start);
        return this.toDayKey(dt);
    }

    private toDayKey(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    private isSameDay(a: Date, b: Date): boolean {
        return (
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate()
        );
    }

    private addDays(date: Date, days: number): Date {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    private getWeekStart(date: Date): Date {
        const d = new Date(date);
        const day = d.getDay();
        const diff = (day + 6) % 7; // Monday = 0
        d.setDate(d.getDate() - diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    private getMinutesOfDay(date: Date): number {
        return date.getHours() * 60 + date.getMinutes();
    }

    private toRFC3339WithTimezone(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        const offset = date.getTimezoneOffset();
        const offsetSign = offset > 0 ? '-' : '+';
        const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
        const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, '0');

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
    }

    private startPolling(): void {
        this.stopPolling(); // Clear any existing interval
        const interval = this.plugin.settings.calendarRefreshInterval * 1000;
        this.pollingInterval = setInterval(() => {
            void this.reloadCalendarEvents();
        }, interval);
    }

    private stopPolling(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    private handleWindowFocus = (): void => {
        console.log("[CalendarView] Window focused, reloading events...");
        // Wrap in try-catch to prevent hanging the UI
        this.reloadCalendarEvents().catch((error) => {
            console.error("[CalendarView] handleWindowFocus error:", error);
            // Silent fail - don't block the UI
        });
    };
}
