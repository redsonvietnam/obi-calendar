/**
 * CalendarPanel.ts
 * 
 * Responsible for calendar UI and views:
 * - Calendar rendering (month, week, day, timeline views)
 * - Event display and interaction
 * - Navigation and date management
 * - Event creation/editing modals
 * 
 * SDD Principle: Single Responsibility - only calendar display logic
 */

import { Notice, App } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { CalendarViewMode, GoogleCalendarEvent } from "./types";
import { DragManager, DragState } from "./DragManager";
import { Logger } from "./Logger";


interface CalendarDayCell {
    date: Date;
    key: string;
    inCurrentMonth: boolean;
    isToday: boolean;
    events: GoogleCalendarEvent[];
}

const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const SNAP_MINUTES = 15;

/**
 * CalendarPanel manages calendar display and interactions
 */
export class CalendarPanel {
    private plugin: ObsidianCalendarAgentPlugin;
    private app: App;

    // Calendar state
    private currentDate = new Date();
    private selectedDate = new Date();
    private calendarEvents: GoogleCalendarEvent[] = [];
    private viewMode: CalendarViewMode = "month";
    private isLoadingCalendar = false;
    private currentTimeInterval: ReturnType<typeof setInterval> | null = null;

    // UI Elements
    private calendarPanelEl!: HTMLDivElement;
    private calendarTitleEl!: HTMLHeadingElement;
    private calendarBodyEl!: HTMLDivElement;

    // Managers
    private dragManager: DragManager;

    // Callbacks
    private onEventDrop?: (
        event: GoogleCalendarEvent,
        newStart: Date,
        newEnd: Date,
        isAllDay: boolean
    ) => Promise<void>;

    constructor(plugin: ObsidianCalendarAgentPlugin, app: App) {
        this.plugin = plugin;
        this.app = app;
        this.dragManager = new DragManager(plugin);
    }

    /**
     * Initialize calendar panel
     */
    public init(
        parentEl: HTMLDivElement,
        onEventDrop: (
            event: GoogleCalendarEvent,
            newStart: Date,
            newEnd: Date,
            isAllDay: boolean
        ) => Promise<void>
    ): void {
        this.calendarPanelEl = parentEl;
        this.onEventDrop = onEventDrop;
        this.dragManager.init(onEventDrop);
        this.render();
    }

    /**
     * Render the calendar panel
     */
    private render(): void {
        this.calendarPanelEl.empty();
        this.calendarPanelEl.addClass("oca-tab-content");

        const wrap = this.calendarPanelEl.createDiv({
            cls: "oca-calendar-container"
        });

        // Header with navigation
        const header = wrap.createDiv({ cls: "oca-calendar-header" });

        const navLeft = header.createDiv({
            cls: "oca-calendar-nav oca-calendar-nav-left"
        });
        const prevBtn = navLeft.createEl("button", {
            text: "◀",
            cls: "oca-nav-btn"
        });
        const todayBtn = navLeft.createEl("button", {
            text: "Hôm nay",
            cls: "oca-nav-btn oca-nav-today"
        });
        const nextBtn = navLeft.createEl("button", {
            text: "▶",
            cls: "oca-nav-btn"
        });

        this.calendarTitleEl = header.createEl("h4", {
            cls: "oca-calendar-title"
        });

        const navRight = header.createDiv({
            cls: "oca-calendar-nav oca-calendar-nav-right"
        });
        const reloadBtn = navRight.createEl("button", {
            text: "↻",
            cls: "oca-nav-btn"
        });

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

        // Calendar body
        this.calendarBodyEl = wrap.createDiv({ cls: "oca-calendar-body" });

        // FAB button for new events
        const fab = wrap.createEl("button", { cls: "oca-fab-btn" });
        fab.createSpan({ cls: "oca-fab-icon", text: "+" });
        fab.addEventListener("click", () => this.showCreateEventModal());

        // Initial render
        this.reloadCalendarEvents();
    }

    /**
     * Set calendar view mode
     */
    private setViewMode(mode: CalendarViewMode): void {
        this.viewMode = mode;
        this.renderCalendarView();
    }

    /**
     * Render calendar based on current view mode
     */
    public renderCalendarView(): void {
        this.updateCalendarTitle();

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

    /**
     * Update calendar title based on current date
     */
    private updateCalendarTitle(): void {
        const options: Intl.DateTimeFormatOptions = {
            year: "numeric",
            month: "long",
            day: this.viewMode === "day" ? "numeric" : undefined
        };

        this.calendarTitleEl.setText(
            this.currentDate.toLocaleDateString("vi-VN", options)
        );
    }

    /**
     * Navigate to previous period
     */
    private navigatePrev(): void {
        switch (this.viewMode) {
            case "day":
                this.currentDate.setDate(this.currentDate.getDate() - 1);
                break;
            case "week":
                this.currentDate.setDate(this.currentDate.getDate() - 7);
                break;
            case "month":
            case "timeline":
                this.currentDate.setMonth(this.currentDate.getMonth() - 1);
                break;
        }
        this.renderCalendarView();
    }

    /**
     * Navigate to next period
     */
    private navigateNext(): void {
        switch (this.viewMode) {
            case "day":
                this.currentDate.setDate(this.currentDate.getDate() + 1);
                break;
            case "week":
                this.currentDate.setDate(this.currentDate.getDate() + 7);
                break;
            case "month":
            case "timeline":
                this.currentDate.setMonth(this.currentDate.getMonth() + 1);
                break;
        }
        this.renderCalendarView();
    }

    /**
     * Navigate to today
     */
    private navigateToday(): void {
        this.currentDate = new Date();
        this.renderCalendarView();
    }

    /**
     * Show event detail modal
     */
    private showEventDetail(event: GoogleCalendarEvent): void {
        const modal = document.createElement("div");
        modal.className = "oca-modal-backdrop";

        const content = modal.createDiv({ cls: "oca-modal-content" });
        content.createEl("h3", { text: event.summary || "No Title" });

        if (event.description) {
            content.createEl("p", { text: event.description });
        }

        if (event.start?.dateTime) {
            const startDate = new Date(event.start.dateTime);
            content.createEl("p", {
                text: `Start: ${startDate.toLocaleString("vi-VN")}`
            });
        }

        if (event.location) {
            content.createEl("p", { text: `Location: ${event.location}` });
        }

        const closeBtn = content.createEl("button", {
            text: "Close",
            cls: "mod-cta"
        });
        closeBtn.addEventListener("click", () => modal.remove());

        document.body.appendChild(modal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    /**
     * Show create event modal
     */
    private showCreateEventModal(): void {
        new Notice("Create event feature coming soon");
    }

    /**
     * Reload calendar events from API
     */
    public async reloadCalendarEvents(): Promise<void> {
        if (this.isLoadingCalendar) return;

        this.isLoadingCalendar = true;
        try {
            const { start, end } = this.getDateRange();
            this.calendarEvents =
                await this.plugin.googleCalendarApi.listEvents({
                    timeMin: start.toISOString(),
                    timeMax: end.toISOString(),
                    maxResults: 250
                });

            this.renderCalendarView();
        } catch (error) {
            Logger.error("CalendarPanel", "Failed to load events:", error);
            new Notice(
                `Lỗi tải sự kiện: ${(error as Error).message}`
            );
        } finally {
            this.isLoadingCalendar = false;
        }
    }

    /**
     * Get date range for current view
     */
    private getDateRange(): { start: Date; end: Date } {
        let start: Date;
        let end: Date;

        switch (this.viewMode) {
            case "day":
                start = new Date(this.currentDate);
                start.setHours(0, 0, 0, 0);
                end = new Date(start);
                end.setDate(end.getDate() + 1);
                break;

            case "week":
                start = this.getWeekStart(this.currentDate);
                end = new Date(start);
                end.setDate(end.getDate() + 7);
                break;

            case "month":
            case "timeline":
                start = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
                end = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
                end.setHours(23, 59, 59, 999);
                break;

            default:
                start = new Date();
                end = new Date(start.getTime() + 86400000);
        }

        return { start, end };
    }

    /**
     * Render day view
     */
    private renderDayView(): void {
        this.calendarBodyEl.empty();
        const dayGrid = this.calendarBodyEl.createDiv({ cls: "oca-day-grid" });
        const scrollContainer = dayGrid.createDiv({
            cls: "oca-timegrid-scroll"
        });

        // Render hours
        for (const hour of HOURS) {
            const hourBlock = scrollContainer.createDiv({
                cls: "oca-hour-block"
            });
            hourBlock.createDiv({
                cls: "oca-hour-label",
                text: `${String(hour).padStart(2, "0")}:00`
            });

            const timeGrid = hourBlock.createDiv({ cls: "oca-time-grid" });
            this.dragManager.setupTimeGridDropZone(timeGrid, this.currentDate);
        }

        // Render events
        const eventsForDay = this.calendarEvents.filter((e) =>
            this.isSameDay(new Date(e.start?.dateTime || e.start?.date || ""), this.currentDate)
        );

        for (const event of eventsForDay) {
            if (!event.start?.dateTime) continue;

            const startDate = new Date(event.start.dateTime);
            const minutesOfDay = this.getMinutesOfDay(startDate);
            const topPx = (minutesOfDay / 60) * HOUR_HEIGHT;

            const endDate = new Date(event.end?.dateTime || startDate.getTime() + 3600000);
            const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000;
            const heightPx = (durationMinutes / 60) * HOUR_HEIGHT;

            const eventEl = scrollContainer.createDiv({ cls: "oca-event-block" });
            eventEl.style.top = `${topPx}px`;
            eventEl.style.height = `${heightPx}px`;
            eventEl.setText(event.summary || "No Title");

            this.dragManager.makeDraggable(eventEl, event);
            eventEl.addEventListener("click", () => this.showEventDetail(event));
        }

        // Current time indicator
        this.renderCurrentTimeIndicator(scrollContainer, false);
        this.startCurrentTimeUpdater(scrollContainer, false);
    }

    /**
     * Render week view
     */
    private renderWeekView(): void {
        this.calendarBodyEl.empty();
        const weekGrid = this.calendarBodyEl.createDiv({ cls: "oca-week-grid" });
        const scrollContainer = weekGrid.createDiv({ cls: "oca-week-grid-scroll" });

        // Get week start
        const weekStart = this.getWeekStart(this.currentDate);

        // Header with day labels
        const headerRow = weekGrid.createDiv({ cls: "oca-week-header" });
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(weekStart);
            dayDate.setDate(dayDate.getDate() + i);
            const dayLabel = headerRow.createDiv({ cls: "oca-week-day-label" });
            dayLabel.setText(
                `${WEEKDAY_LABELS[i]} ${dayDate.getDate()}`
            );
        }

        // Time grid columns
        for (const hour of HOURS) {
            const hourRow = scrollContainer.createDiv({
                cls: "oca-week-hour-row"
            });

            // Hour label
            const labelCol = hourRow.createDiv({ cls: "oca-hour-label-col" });
            labelCol.setText(`${String(hour).padStart(2, "0")}:00`);

            // Day columns
            for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
                const dayDate = new Date(weekStart);
                dayDate.setDate(dayDate.getDate() + dayIdx);

                const dayCol = hourRow.createDiv({ cls: "oca-week-day-col" });
                this.dragManager.setupTimeGridDropZone(dayCol, dayDate);
            }
        }

        // Events
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        for (const event of this.calendarEvents) {
            if (!event.start?.dateTime) continue;

            const eventStart = new Date(event.start.dateTime);
            if (eventStart < weekStart || eventStart >= weekEnd) continue;

            // Calculate position
            const dayOffset = Math.floor((eventStart.getTime() - weekStart.getTime()) / 86400000);
            const minutesOfDay = this.getMinutesOfDay(eventStart);
            const topPx = (minutesOfDay / 60) * HOUR_HEIGHT;

            const eventEnd = new Date(event.end?.dateTime || eventStart.getTime() + 3600000);
            const durationMinutes = (eventEnd.getTime() - eventStart.getTime()) / 60000;
            const heightPx = (durationMinutes / 60) * HOUR_HEIGHT;

            const eventEl = scrollContainer.createDiv({ cls: "oca-event-block" });
            eventEl.style.top = `${topPx}px`;
            eventEl.style.height = `${heightPx}px`;
            eventEl.style.left = `calc(${dayOffset} * (100% / 7))`;
            eventEl.setText(event.summary || "No Title");

            this.dragManager.makeDraggable(eventEl, event);
            eventEl.addEventListener("click", () => this.showEventDetail(event));
        }

        this.renderCurrentTimeIndicator(scrollContainer, true);
        this.startCurrentTimeUpdater(scrollContainer, true);
    }

    /**
     * Render month view
     */
    private renderMonthView(): void {
        this.calendarBodyEl.empty();
        const monthGrid = this.calendarBodyEl.createDiv({ cls: "oca-month-grid" });

        // Weekday headers
        const headerRow = monthGrid.createDiv({ cls: "oca-month-header" });
        for (const dayLabel of WEEKDAY_LABELS) {
            headerRow.createDiv({ cls: "oca-month-header-cell", text: dayLabel });
        }

        // Day cells
        const cells = this.buildMonthCells(this.currentDate);
        for (const cell of cells) {
            const cellEl = monthGrid.createDiv({
                cls: `oca-month-cell ${cell.inCurrentMonth ? "" : "oca-other-month"} ${cell.isToday ? "oca-today" : ""}`
            });

            const cellHeader = cellEl.createDiv({ cls: "oca-month-cell-header" });
            cellHeader.createEl("strong", { text: String(cell.date.getDate()) });

            const eventsContainer = cellEl.createDiv({
                cls: "oca-month-cell-events"
            });

            for (const event of cell.events) {
                const eventEl = eventsContainer.createDiv({
                    cls: "oca-month-cell-event",
                    text: event.summary || "No Title"
                });
                eventEl.addEventListener("click", () =>
                    this.showEventDetail(event)
                );
                this.dragManager.makeDraggable(eventEl, event);
            }

            this.dragManager.setupDayDropZone(cellEl, cell.date);
        }
    }

    /**
     * Render timeline view (placeholder)
     */
    private renderTimelineView(): void {
        this.calendarBodyEl.empty();
        const timelineEl = this.calendarBodyEl.createDiv({ cls: "oca-timeline" });
        timelineEl.setText("Timeline view coming soon");
    }

    /**
     * Build cells for month view
     */
    private buildMonthCells(monthDate: Date): CalendarDayCell[] {
        const cells: CalendarDayCell[] = [];
        const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        const prevMonthLastDay = new Date(firstDay.getTime() - 1);

        // Previous month days
        const firstDayOfWeek = firstDay.getDay();
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const date = new Date(prevMonthLastDay);
            date.setDate(prevMonthLastDay.getDate() - i);
            cells.push({
                date,
                key: this.toDayKey(date),
                inCurrentMonth: false,
                isToday: this.isSameDay(date, new Date()),
                events: this.getEventsForDate(date)
            });
        }

        // Current month days
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
            cells.push({
                date,
                key: this.toDayKey(date),
                inCurrentMonth: true,
                isToday: this.isSameDay(date, new Date()),
                events: this.getEventsForDate(date)
            });
        }

        // Next month days
        const remainingCells = 42 - cells.length;
        for (let i = 1; i <= remainingCells; i++) {
            const date = new Date(lastDay);
            date.setDate(lastDay.getDate() + i);
            cells.push({
                date,
                key: this.toDayKey(date),
                inCurrentMonth: false,
                isToday: this.isSameDay(date, new Date()),
                events: this.getEventsForDate(date)
            });
        }

        return cells;
    }

    /**
     * Get events for a specific date
     */
    private getEventsForDate(date: Date): GoogleCalendarEvent[] {
        return this.calendarEvents.filter((e) =>
            this.isSameDay(new Date(e.start?.dateTime || e.start?.date || ""), date)
        );
    }

    /**
     * Convert date to day key (YYYY-MM-DD)
     */
    private toDayKey(date: Date): string {
        return date.toISOString().split("T")[0];
    }

    /**
     * Check if two dates are the same day
     */
    private isSameDay(a: Date, b: Date): boolean {
        return this.toDayKey(a) === this.toDayKey(b);
    }

    /**
     * Get minutes from start of day
     */
    private getMinutesOfDay(date: Date): number {
        return date.getHours() * 60 + date.getMinutes();
    }

    /**
     * Get week start (Monday)
     */
    private getWeekStart(date: Date): Date {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    /**
     * Render current time indicator
     */
    private renderCurrentTimeIndicator(
        container: HTMLElement,
        isWeekView = false
    ): void {
        const now = new Date();
        const minutes = this.getMinutesOfDay(now);
        const topPx = (minutes / 60) * HOUR_HEIGHT;

        const indicator = container.createDiv({ cls: "oca-current-time" });
        indicator.style.top = `${topPx}px`;
    }

    /**
     * Start updating current time indicator
     */
    private startCurrentTimeUpdater(
        container: HTMLElement,
        isWeekView = false
    ): void {
        if (this.currentTimeInterval) {
            clearInterval(this.currentTimeInterval);
        }

        this.currentTimeInterval = setInterval(() => {
            const indicator = container.querySelector(".oca-current-time");
            if (!indicator) return;

            const now = new Date();
            const minutes = this.getMinutesOfDay(now);
            const topPx = (minutes / 60) * HOUR_HEIGHT;
            (indicator as HTMLElement).style.top = `${topPx}px`;
        }, 60000);
    }

    /**
     * Clean up resources
     */
    public cleanup(): void {
        if (this.currentTimeInterval) {
            clearInterval(this.currentTimeInterval);
        }
        this.dragManager.cleanup();
    }

    /**
     * Get calendar events
     */
    getCalendarEvents(): GoogleCalendarEvent[] {
        return this.calendarEvents;
    }

    /**
     * Get current date
     */
    getCurrentDate(): Date {
        return this.currentDate;
    }
}