/**
 * DragManager.ts
 * 
 * Handles drag & drop functionality for calendar events:
 * - Event dragging setup
 * - Drop zone management (time grid, day cells)
 * - Drag preview and feedback
 * - Event rescheduling
 * 
 * SDD Principle: Single Responsibility - only drag/drop logic
 */

import { Notice } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { GoogleCalendarEvent } from "./types";

/**
 * State for an active drag operation
 */
export interface DragState {
    event: GoogleCalendarEvent;
    originalStartMs: number;
    originalEndMs: number;
    durationMs: number;
    offsetMinutes: number;
    sourceElement: HTMLElement | null;
}

// Constants for drag & drop behavior
const HOUR_HEIGHT = 60; // px per hour in time grid views
const SNAP_MINUTES = 15; // snap to 15-minute intervals

/**
 * DragManager handles all drag & drop operations for calendar events
 */
export class DragManager {
    private plugin: ObsidianCalendarAgentPlugin;
    private dragState: DragState | null = null;
    private dragGhostEl: HTMLDivElement | null = null;

    // Callback for when event is dropped
    private onEventDrop?: (
        event: GoogleCalendarEvent,
        newStart: Date,
        newEnd: Date,
        isAllDay: boolean
    ) => Promise<void>;

    constructor(plugin: ObsidianCalendarAgentPlugin) {
        this.plugin = plugin;
    }

    /**
     * Initialize DragManager with event drop callback
     */
    public init(
        onEventDrop: (
            event: GoogleCalendarEvent,
            newStart: Date,
            newEnd: Date,
            isAllDay: boolean
        ) => Promise<void>
    ): void {
        this.onEventDrop = onEventDrop;
    }

    /**
     * Make an event element draggable
     */
    public makeDraggable(el: HTMLElement, event: GoogleCalendarEvent): void {
        if (!event.id) return;

        el.setAttribute("draggable", "true");
        el.addClass("oca-draggable");

        el.addEventListener("dragstart", (e: DragEvent) => {
            this.handleDragStart(e, el, event);
        });

        el.addEventListener("dragend", () => {
            this.handleDragEnd(el);
        });
    }

    /**
     * Handle drag start event
     */
    private handleDragStart(
        e: DragEvent,
        el: HTMLElement,
        event: GoogleCalendarEvent
    ): void {
        if (!e.dataTransfer) return;

        // Calculate event duration
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

        // Calculate offset from top of event block in minutes
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

        // Fade the source element
        setTimeout(() => {
            el.addClass("oca-dragging");
        }, 0);
    }

    /**
     * Handle drag end event
     */
    private handleDragEnd(el: HTMLElement): void {
        el.removeClass("oca-dragging");
        this.cleanup();
    }

    /**
     * Setup a time grid drop zone (for day/week views)
     */
    public setupTimeGridDropZone(
        gridEl: HTMLElement,
        dateForColumn: Date
    ): void {
        gridEl.addEventListener("dragover", (e: DragEvent) => {
            this.handleTimeGridDragOver(e, gridEl);
        });

        gridEl.addEventListener("dragleave", (e: DragEvent) => {
            this.handleTimeGridDragLeave(e, gridEl);
        });

        gridEl.addEventListener("drop", (e: DragEvent) => {
            this.handleTimeGridDrop(e, gridEl, dateForColumn);
        });
    }

    /**
     * Handle dragover for time grid
     */
    private handleTimeGridDragOver(e: DragEvent, gridEl: HTMLElement): void {
        if (!this.dragState || !e.dataTransfer) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        gridEl.addClass("oca-drop-target-active");

        // Show preview indicator
        this.showTimeGridPreview(e, gridEl);
    }

    /**
     * Show preview of event at drop location
     */
    private showTimeGridPreview(e: DragEvent, gridEl: HTMLElement): void {
        if (!this.dragState) return;

        const rect = gridEl.getBoundingClientRect();
        const scrollParent = gridEl.closest(
            ".oca-timegrid-scroll, .oca-week-grid-scroll"
        );
        const scrollTop = scrollParent ? (scrollParent as HTMLElement).scrollTop : 0;
        const mouseY = e.clientY - rect.top + scrollTop;

        const minutes = Math.max(
            0,
            Math.min(
                1440,
                (mouseY / HOUR_HEIGHT) * 60 - this.dragState.offsetMinutes
            )
        );
        const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
        const previewTop = (snapped / 60) * HOUR_HEIGHT;
        const previewHeight = (this.dragState.durationMs / 3600000) * HOUR_HEIGHT;

        let preview = gridEl.querySelector(".oca-drag-preview") as
            | HTMLDivElement
            | null;
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
    }

    /**
     * Handle dragleave for time grid
     */
    private handleTimeGridDragLeave(e: DragEvent, gridEl: HTMLElement): void {
        const relatedTarget = e.relatedTarget as HTMLElement | null;
        if (!relatedTarget || !gridEl.contains(relatedTarget)) {
            gridEl.removeClass("oca-drop-target-active");
            const preview = gridEl.querySelector(".oca-drag-preview");
            if (preview) preview.remove();
        }
    }

    /**
     * Handle drop on time grid
     */
    private handleTimeGridDrop(
        e: DragEvent,
        gridEl: HTMLElement,
        dateForColumn: Date
    ): void {
        e.preventDefault();
        if (!this.dragState) return;

        const rect = gridEl.getBoundingClientRect();
        const scrollParent = gridEl.closest(
            ".oca-timegrid-scroll, .oca-week-grid-scroll"
        );
        const scrollTop = scrollParent ? (scrollParent as HTMLElement).scrollTop : 0;
        const mouseY = e.clientY - rect.top + scrollTop;

        const minutes = Math.max(
            0,
            Math.min(
                1440,
                (mouseY / HOUR_HEIGHT) * 60 - this.dragState.offsetMinutes
            )
        );
        const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

        const newStart = new Date(dateForColumn);
        newStart.setHours(0, 0, 0, 0);
        newStart.setMinutes(snapped);

        const newEnd = new Date(newStart.getTime() + this.dragState.durationMs);

        this.executeEventDrop(
            this.dragState.event,
            newStart,
            newEnd,
            false
        );
        this.cleanup();
    }

    /**
     * Setup a day cell drop zone (for month view)
     */
    public setupDayDropZone(
        cellEl: HTMLElement,
        targetDate: Date
    ): void {
        cellEl.addEventListener("dragover", (e: DragEvent) => {
            this.handleDayDragOver(e, cellEl);
        });

        cellEl.addEventListener("dragleave", (e: DragEvent) => {
            this.handleDayDragLeave(e, cellEl);
        });

        cellEl.addEventListener("drop", (e: DragEvent) => {
            this.handleDayDrop(e, cellEl, targetDate);
        });
    }

    /**
     * Handle dragover for day cell
     */
    private handleDayDragOver(e: DragEvent, cellEl: HTMLElement): void {
        if (!this.dragState || !e.dataTransfer) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        cellEl.addClass("oca-drop-target-active");
    }

    /**
     * Handle dragleave for day cell
     */
    private handleDayDragLeave(e: DragEvent, cellEl: HTMLElement): void {
        const relatedTarget = e.relatedTarget as HTMLElement | null;
        if (!relatedTarget || !cellEl.contains(relatedTarget)) {
            cellEl.removeClass("oca-drop-target-active");
        }
    }

    /**
     * Handle drop on day cell
     */
    private handleDayDrop(
        e: DragEvent,
        cellEl: HTMLElement,
        targetDate: Date
    ): void {
        e.preventDefault();
        if (!this.dragState) return;

        cellEl.removeClass("oca-drop-target-active");

        const ev = this.dragState.event;
        const isAllDay = !!ev.start?.date;

        if (isAllDay) {
            // All-day event: just move to new date
            const newEnd = new Date(targetDate);
            newEnd.setDate(newEnd.getDate() + 1);
            this.executeEventDrop(ev, targetDate, newEnd, true);
        } else if (ev.start?.dateTime) {
            // Timed event: keep same time, change date
            const oldStart = new Date(ev.start.dateTime);
            const newStart = new Date(targetDate);
            newStart.setHours(
                oldStart.getHours(),
                oldStart.getMinutes(),
                oldStart.getSeconds(),
                0
            );
            const newEnd = new Date(newStart.getTime() + this.dragState.durationMs);
            this.executeEventDrop(ev, newStart, newEnd, false);
        }

        this.cleanup();
    }

    /**
     * Execute the event drop (call callback)
     */
    private async executeEventDrop(
        event: GoogleCalendarEvent,
        newStart: Date,
        newEnd: Date,
        isAllDay: boolean
    ): Promise<void> {
        if (!this.onEventDrop) {
            console.warn("[DragManager] onEventDrop callback not set");
            return;
        }

        try {
            await this.onEventDrop(event, newStart, newEnd, isAllDay);
        } catch (error) {
            console.error("[DragManager] Event drop failed:", error);
            new Notice(
                `Lỗi di chuyển sự kiện: ${(error as Error).message}`
            );
        }
    }

    /**
     * Clean up drag operation
     */
    public cleanup(): void {
        if (this.dragGhostEl) {
            this.dragGhostEl.remove();
            this.dragGhostEl = null;
        }

        document
            .querySelectorAll(".oca-drop-target-active")
            .forEach((el) => {
                el.removeClass("oca-drop-target-active");
            });

        document
            .querySelectorAll(".oca-drag-preview")
            .forEach((el) => el.remove());

        this.dragState = null;
    }

    /**
     * Get current drag state
     */
    getDragState(): DragState | null {
        return this.dragState;
    }
}
