import {
    ItemView,
    Notice,
    WorkspaceLeaf
} from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import {
    ChatMessage,
    GoogleCalendarEvent
} from "./types";

export const CALENDAR_VIEW_TYPE = "obsidian-calendar-agent-view";

type ActiveTab = "chat" | "calendar";

interface CalendarDayCell {
    date: Date;
    key: string;
    inCurrentMonth: boolean;
    isToday: boolean;
    events: GoogleCalendarEvent[];
}

/**
 * Chat + Calendar sidebar native DOM cho Obsidian.
 * - Chat UI kiểu modern bubble
 * - Calendar view kiểu Google Calendar (month grid)
 */
export class CalendarView extends ItemView {
    private plugin: ObsidianCalendarAgentPlugin;
    private messages: ChatMessage[] = [];

    private rootEl!: HTMLDivElement;

    private tabChatEl!: HTMLButtonElement;
    private tabCalendarEl!: HTMLButtonElement;
    private chatPanelEl!: HTMLDivElement;
    private calendarPanelEl!: HTMLDivElement;

    private messagesEl!: HTMLDivElement;
    private inputEl!: HTMLTextAreaElement;
    private sendBtnEl!: HTMLButtonElement;
    private statusEl!: HTMLDivElement;

    private calendarMonthTitleEl!: HTMLHeadingElement;
    private calendarDaysEl!: HTMLDivElement;
    private calendarEventsListEl!: HTMLDivElement;

    private activeTab: ActiveTab = "chat";
    private isSending = false;
    private isLoadingCalendar = false;

    private currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    private selectedDate = new Date();
    private calendarEvents: GoogleCalendarEvent[] = [];

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
        await this.reloadCalendarForCurrentMonth();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    private renderLayout(): void {
        const { contentEl } = this;
        contentEl.empty();

        this.rootEl = contentEl.createDiv({ cls: "oca-chat-root" });

        const headerEl = this.rootEl.createDiv({ cls: "oca-chat-header" });
        headerEl.createEl("h3", { text: "Calendar Agent" });
        headerEl.createEl("p", {
            text: "Gemini Assistant + Google Calendar Workspace"
        });

        const tabsEl = this.rootEl.createDiv({ cls: "oca-tabs" });
        this.tabChatEl = tabsEl.createEl("button", { cls: "oca-tab", text: "Chat" });
        this.tabCalendarEl = tabsEl.createEl("button", { cls: "oca-tab", text: "Calendar" });

        this.tabChatEl.addEventListener("click", () => this.switchTab("chat"));
        this.tabCalendarEl.addEventListener("click", () => this.switchTab("calendar"));

        this.chatPanelEl = this.rootEl.createDiv({ cls: "oca-tab-content" });
        this.calendarPanelEl = this.rootEl.createDiv({ cls: "oca-tab-content" });

        this.renderChatPanel();
        this.renderCalendarPanel();
    }

    private renderChatPanel(): void {
        const quickEl = this.chatPanelEl.createDiv({ cls: "oca-quick-actions" });

        const quickPrompts: Array<{ label: string; prompt: string }> = [
            {
                label: "Lịch hôm nay",
                prompt: "Hãy liệt kê lịch hôm nay của tôi."
            },
            {
                label: "5 sự kiện tới",
                prompt: "Hãy liệt kê 5 sự kiện sắp tới trong lịch của tôi."
            },
            {
                label: "Tuần này",
                prompt: "Tóm tắt các sự kiện quan trọng trong tuần này."
            }
        ];

        for (const item of quickPrompts) {
            const btn = quickEl.createEl("button", {
                cls: "oca-quick-action-btn",
                text: item.label
            });
            btn.addEventListener("click", () => {
                void this.sendMessage(item.prompt);
            });
        }

        this.messagesEl = this.chatPanelEl.createDiv({ cls: "oca-chat-messages" });

        this.statusEl = this.chatPanelEl.createDiv({ cls: "oca-chat-status" });
        this.statusEl.setText("Đang khởi tạo...");

        const composerEl = this.chatPanelEl.createDiv({ cls: "oca-chat-composer" });

        this.inputEl = composerEl.createEl("textarea", {
            cls: "oca-chat-input"
        });
        this.inputEl.placeholder = "Nhập yêu cầu... (VD: Đặt lịch họp 9h sáng mai)";
        this.inputEl.rows = 3;

        this.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
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
    }

    private renderCalendarPanel(): void {
        const wrap = this.calendarPanelEl.createDiv({ cls: "oca-calendar-container" });

        const header = wrap.createDiv({ cls: "oca-calendar-header" });
        this.calendarMonthTitleEl = header.createEl("h4", { cls: "oca-calendar-title" });

        const nav = header.createDiv({ cls: "oca-calendar-nav" });
        const prevBtn = nav.createEl("button", { text: "◀" });
        const todayBtn = nav.createEl("button", { text: "Today" });
        const nextBtn = nav.createEl("button", { text: "▶" });
        const reloadBtn = nav.createEl("button", { text: "↻" });

        prevBtn.addEventListener("click", () => {
            this.currentMonth = new Date(
                this.currentMonth.getFullYear(),
                this.currentMonth.getMonth() - 1,
                1
            );
            void this.reloadCalendarForCurrentMonth();
        });

        todayBtn.addEventListener("click", () => {
            const now = new Date();
            this.currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            this.selectedDate = now;
            void this.reloadCalendarForCurrentMonth();
        });

        nextBtn.addEventListener("click", () => {
            this.currentMonth = new Date(
                this.currentMonth.getFullYear(),
                this.currentMonth.getMonth() + 1,
                1
            );
            void this.reloadCalendarForCurrentMonth();
        });

        reloadBtn.addEventListener("click", () => {
            void this.reloadCalendarForCurrentMonth();
        });

        const weekdays = wrap.createDiv({ cls: "oca-calendar-weekdays" });
        const labels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
        for (const label of labels) {
            weekdays.createDiv({ cls: "oca-calendar-weekday", text: label });
        }

        this.calendarDaysEl = wrap.createDiv({ cls: "oca-calendar-days" });
        this.calendarEventsListEl = wrap.createDiv({ cls: "oca-chat-messages" });
    }

    private switchTab(tab: ActiveTab): void {
        this.activeTab = tab;

        this.tabChatEl.toggleClass("active", tab === "chat");
        this.tabCalendarEl.toggleClass("active", tab === "calendar");
        this.chatPanelEl.toggleClass("active", tab === "chat");
        this.calendarPanelEl.toggleClass("active", tab === "calendar");
    }

    private renderMessages(): void {
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

            const body = row.createDiv({ cls: "oca-msg-body" });
            body.setText(msg.content);
        }

        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    private async handleSubmit(): Promise<void> {
        const text = this.inputEl.value.trim();
        if (!text) return;

        this.inputEl.value = "";
        await this.sendMessage(text);
    }

    private async sendMessage(text: string): Promise<void> {
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
            await this.reloadCalendarForCurrentMonth();
        } catch (error) {
            const message = (error as Error).message;
            console.error("[CalendarView] sendMessage failed", error);
            this.pushMessage("assistant", `Lỗi: ${message}`);
            this.setStatus("Có lỗi khi gọi Gemini.");
        } finally {
            this.setSending(false);
        }
    }

    private async reloadCalendarForCurrentMonth(): Promise<void> {
        if (this.isLoadingCalendar) return;
        this.isLoadingCalendar = true;

        try {
            const rangeStart = new Date(
                this.currentMonth.getFullYear(),
                this.currentMonth.getMonth() - 1,
                1
            );
            const rangeEnd = new Date(
                this.currentMonth.getFullYear(),
                this.currentMonth.getMonth() + 2,
                0,
                23,
                59,
                59
            );

            this.calendarEvents = await this.plugin.googleCalendarApi.listEvents({
                timeMin: rangeStart.toISOString(),
                timeMax: rangeEnd.toISOString(),
                maxResults: 500,
                singleEvents: true,
                orderBy: "startTime"
            });
        } catch (error) {
            console.error("[CalendarView] reloadCalendarForCurrentMonth failed", error);
            new Notice(`Không tải được dữ liệu calendar: ${(error as Error).message}`);
            this.calendarEvents = [];
        } finally {
            this.isLoadingCalendar = false;
            this.renderCalendar();
        }
    }

    private renderCalendar(): void {
        this.calendarMonthTitleEl.setText(
            this.currentMonth.toLocaleDateString("vi-VN", {
                month: "long",
                year: "numeric"
            })
        );

        this.calendarDaysEl.empty();

        const cells = this.buildMonthCells(this.currentMonth);

        for (const cell of cells) {
            const dayEl = this.calendarDaysEl.createDiv({ cls: "oca-calendar-day" });

            if (!cell.inCurrentMonth) dayEl.addClass("other-month");
            if (cell.isToday) dayEl.addClass("today");
            if (this.isSameDay(cell.date, this.selectedDate)) dayEl.addClass("selected");

            dayEl.addEventListener("click", () => {
                this.selectedDate = new Date(cell.date.getTime());
                this.renderCalendar();
            });

            dayEl.createDiv({
                cls: "oca-calendar-day-num",
                text: String(cell.date.getDate())
            });

            const dots = dayEl.createDiv({ cls: "oca-calendar-day-events" });
            for (let i = 0; i < Math.min(cell.events.length, 3); i += 1) {
                const dot = dots.createDiv({ cls: "oca-event-dot" });
                if (i === 1) dot.addClass("secondary");
                if (i === 2) dot.addClass("tertiary");
            }
        }

        this.renderSelectedDayEvents();
    }

    private renderSelectedDayEvents(): void {
        this.calendarEventsListEl.empty();

        const dayKey = this.toDayKey(this.selectedDate);
        const events = this.calendarEvents.filter((event) => this.toDayKeyFromEvent(event) === dayKey);

        const title = this.calendarEventsListEl.createDiv({ cls: "oca-msg-meta" });
        title.setText(
            `Sự kiện ngày ${this.selectedDate.toLocaleDateString("vi-VN", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            })}`
        );

        if (events.length === 0) {
            const empty = this.calendarEventsListEl.createDiv({ cls: "oca-chat-empty" });
            empty.setText("Không có sự kiện trong ngày.");
            return;
        }

        for (const event of events) {
            const row = this.calendarEventsListEl.createDiv({ cls: "oca-msg oca-msg-assistant" });
            const meta = row.createDiv({ cls: "oca-msg-meta" });
            meta.setText(this.getEventTimeLabel(event));

            const body = row.createDiv({ cls: "oca-msg-body" });
            const summary = event.summary?.trim() || "(Không có tiêu đề)";
            const location = event.location?.trim();
            const desc = event.description?.trim();

            const lines = [summary];
            if (location) lines.push(`📍 ${location}`);
            if (desc) lines.push(desc);

            body.setText(lines.join("\n"));
        }
    }

    private buildMonthCells(monthDate: Date): CalendarDayCell[] {
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const firstOfMonth = new Date(year, month, 1);
        const lastOfMonth = new Date(year, month + 1, 0);

        // Monday-first index (0=Mon ... 6=Sun)
        const mondayFirst = (firstOfMonth.getDay() + 6) % 7;
        const gridStart = new Date(year, month, 1 - mondayFirst);

        const totalDays = 42;
        const cells: CalendarDayCell[] = [];

        const eventsMap = this.groupEventsByDay();

        for (let i = 0; i < totalDays; i += 1) {
            const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
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

    private getEventTimeLabel(event: GoogleCalendarEvent): string {
        if (event.start?.date) return "Cả ngày";
        if (!event.start?.dateTime) return "Không rõ giờ";

        return new Date(event.start.dateTime).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    private setSending(isSending: boolean): void {
        this.isSending = isSending;
        this.sendBtnEl.disabled = isSending;
        this.inputEl.disabled = isSending;
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
}