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

    private calendarTitleEl!: HTMLHeadingElement;
    private calendarBodyEl!: HTMLDivElement;

    private activeTab: ActiveTab = "chat";
    private viewMode: CalendarViewMode = "month";
    private isSending = false;
    private isLoadingCalendar = false;

    private currentDate = new Date(); // anchor date for navigation
    private selectedDate = new Date();
    private calendarEvents: GoogleCalendarEvent[] = [];

    private currentTimeInterval: ReturnType<typeof setInterval> | null = null;
    private pollingInterval: ReturnType<typeof setInterval> | null = null;

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

        // Top bar: navigation
        const header = wrap.createDiv({ cls: "oca-calendar-header" });

        const nav = header.createDiv({ cls: "oca-calendar-nav" });
        const prevBtn = nav.createEl("button", { text: "◀", cls: "oca-nav-btn" });
        const todayBtn = nav.createEl("button", { text: "Hôm nay", cls: "oca-nav-btn oca-nav-today" });
        const nextBtn = nav.createEl("button", { text: "▶", cls: "oca-nav-btn" });

        this.calendarTitleEl = header.createEl("h4", { cls: "oca-calendar-title" });

        const reloadBtn = header.createEl("button", { text: "↻", cls: "oca-nav-btn" });

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
        this.chatPanelEl.toggleClass("active", tab === "chat");
        this.calendarPanelEl.toggleClass("active", tab === "calendar");

        if (tab === "calendar") {
            this.renderCalendarView();
        }
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
        void this.reloadCalendarEvents();
    };
}
