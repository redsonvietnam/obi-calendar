import { requestUrl, RequestUrlResponse } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { OAuthManager } from "./OAuthManager";
import {
    DEFAULT_TIMEZONE,
    GoogleCalendarEvent
} from "./types";

export interface ListEventsParams {
    calendarId?: string;
    timeMin?: string; // RFC3339
    timeMax?: string; // RFC3339
    maxResults?: number;
    singleEvents?: boolean;
    orderBy?: "startTime" | "updated";
    timeZone?: string;
    q?: string;
}

export interface GoogleCalendarApiError {
    code: number;
    message: string;
    status?: string;
    details?: unknown;
}

interface ListEventsResponse {
    kind: string;
    etag: string;
    summary: string;
    updated: string;
    timeZone: string;
    items: GoogleCalendarEvent[];
}

export class GoogleCalendarAPI {
    private static readonly BASE_URL = "https://www.googleapis.com/calendar/v3";

    private plugin: ObsidianCalendarAgentPlugin;
    private oauthManager: OAuthManager;

    constructor(plugin: ObsidianCalendarAgentPlugin, oauthManager: OAuthManager) {
        this.plugin = plugin;
        this.oauthManager = oauthManager;
    }

    /**
     * List events từ Google Calendar.
     * Đây là API quan trọng để verify Session 2 (list_events).
     */
    async listEvents(params: ListEventsParams = {}): Promise<GoogleCalendarEvent[]> {
        const calendarId = encodeURIComponent(params.calendarId ?? "primary");
        const query = new URLSearchParams();

        if (params.timeMin) query.set("timeMin", params.timeMin);
        if (params.timeMax) query.set("timeMax", params.timeMax);
        query.set("maxResults", String(params.maxResults ?? 20));
        query.set("singleEvents", String(params.singleEvents ?? true));
        query.set("orderBy", params.orderBy ?? "startTime");
        query.set("timeZone", params.timeZone ?? this.getTimezone());
        if (params.q) query.set("q", params.q);

        const path = `/calendars/${calendarId}/events?${query.toString()}`;
        const response = await this.request<ListEventsResponse>("GET", path);

        return response.items ?? [];
    }

    async getEvent(calendarId: string, eventId: string): Promise<GoogleCalendarEvent> {
        this.assertRequired(calendarId, "calendarId");
        this.assertRequired(eventId, "eventId");

        const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        return this.request<GoogleCalendarEvent>("GET", path);
    }

    async createEvent(calendarId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent> {
        this.assertRequired(calendarId, "calendarId");
        this.validateEventPayload(event);

        const path = `/calendars/${encodeURIComponent(calendarId)}/events`;
        return this.request<GoogleCalendarEvent>("POST", path, event);
    }

    async updateEvent(calendarId: string, eventId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent> {
        this.assertRequired(calendarId, "calendarId");
        this.assertRequired(eventId, "eventId");
        this.validateEventPayload(event);

        const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        return this.request<GoogleCalendarEvent>("PUT", path, event);
    }

    async patchEvent(calendarId: string, eventId: string, partial: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent> {
        this.assertRequired(calendarId, "calendarId");
        this.assertRequired(eventId, "eventId");

        const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        return this.request<GoogleCalendarEvent>("PATCH", path, partial);
    }

    async deleteEvent(calendarId: string, eventId: string): Promise<void> {
        this.assertRequired(calendarId, "calendarId");
        this.assertRequired(eventId, "eventId");

        const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        await this.request<void>("DELETE", path);
    }

    private async request<T>(
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        path: string,
        body?: unknown
    ): Promise<T> {
        const accessToken = await this.oauthManager.getValidAccessToken();
        const url = `${GoogleCalendarAPI.BASE_URL}${path}`;

        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`
        };

        let requestBody: string | undefined;
        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            requestBody = JSON.stringify(body);
        }

        const response = await requestUrl({
            url,
            method,
            headers,
            body: requestBody,
            throw: false
        });

        if (response.status < 200 || response.status >= 300) {
            const apiError = this.parseApiError(response);
            const err = new Error(
                `[GoogleCalendarAPI] ${method} ${path} failed: ${apiError.code} ${apiError.message}`
            ) as Error & { apiError?: GoogleCalendarApiError };
            err.apiError = apiError;
            throw err;
        }

        if (response.status === 204) {
            return undefined as T;
        }

        return response.json as T;
    }

    /**
     * Chuẩn hóa lỗi trả về từ Google API để debug dễ hơn.
     */
    private parseApiError(response: RequestUrlResponse): GoogleCalendarApiError {
        const fallback: GoogleCalendarApiError = {
            code: response.status,
            message: "Unknown Google API error"
        };

        try {
            const json = response.json as {
                error?: {
                    code?: number;
                    message?: string;
                    status?: string;
                    errors?: unknown;
                };
            };

            if (!json?.error) return fallback;

            return {
                code: json.error.code ?? response.status,
                message: json.error.message ?? fallback.message,
                status: json.error.status,
                details: json.error.errors
            };
        } catch {
            return fallback;
        }
    }

    private getTimezone(): string {
        const tz = this.plugin.settings.timezone?.trim();
        return tz || DEFAULT_TIMEZONE;
    }

    private assertRequired(value: string, fieldName: string): void {
        if (!value?.trim()) {
            throw new Error(`[GoogleCalendarAPI] Thiếu trường bắt buộc: ${fieldName}`);
        }
    }

    private validateEventPayload(event: GoogleCalendarEvent): void {
        if (!event) {
            throw new Error("[GoogleCalendarAPI] Event payload không được rỗng.");
        }

        // Logic quan trọng: Google Calendar bắt buộc start/end cho create/update
        if (!event.start || !event.end) {
            throw new Error("[GoogleCalendarAPI] Event phải có start và end.");
        }

        const validStart = Boolean(event.start.date || event.start.dateTime);
        const validEnd = Boolean(event.end.date || event.end.dateTime);

        if (!validStart || !validEnd) {
            throw new Error("[GoogleCalendarAPI] start/end phải chứa date hoặc dateTime.");
        }
    }
}