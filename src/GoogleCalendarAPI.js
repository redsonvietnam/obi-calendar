import { DEFAULT_TIMEZONE } from "./types";
export class GoogleCalendarAPI {
    constructor(plugin, oauthManager) {
        this.plugin = plugin;
        this.oauthManager = oauthManager;
    }
    /**
     * List events từ Google Calendar.
     * Đây là API quan trọng để verify Session 2 (list_events).
     */
    async listEvents(params = {}) {
        const calendarId = encodeURIComponent(params.calendarId ?? "primary");
        const query = new URLSearchParams();
        if (params.timeMin)
            query.set("timeMin", params.timeMin);
        if (params.timeMax)
            query.set("timeMax", params.timeMax);
        query.set("maxResults", String(params.maxResults ?? 20));
        query.set("singleEvents", String(params.singleEvents ?? true));
        query.set("orderBy", params.orderBy ?? "startTime");
        query.set("timeZone", params.timeZone ?? this.getTimezone());
        if (params.q)
            query.set("q", params.q);
        const path = `/calendars/${calendarId}/events?${query.toString()}`;
        const response = await this.request("GET", path);
        return response.items ?? [];
    }
    async getEvent(calendarId, eventId) {
        this.assertRequired(calendarId, "calendarId");
        this.assertRequired(eventId, "eventId");
        const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        return this.request("GET", path);
    }
    async createEvent(calendarId, event) {
        this.assertRequired(calendarId, "calendarId");
        this.validateEventPayload(event);
        const path = `/calendars/${encodeURIComponent(calendarId)}/events`;
        return this.request("POST", path, event);
    }
    async updateEvent(calendarId, eventId, event) {
        this.assertRequired(calendarId, "calendarId");
        this.assertRequired(eventId, "eventId");
        this.validateEventPayload(event);
        const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        return this.request("PUT", path, event);
    }
    async patchEvent(calendarId, eventId, partial) {
        this.assertRequired(calendarId, "calendarId");
        this.assertRequired(eventId, "eventId");
        const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        return this.request("PATCH", path, partial);
    }
    async deleteEvent(calendarId, eventId) {
        this.assertRequired(calendarId, "calendarId");
        this.assertRequired(eventId, "eventId");
        const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        await this.request("DELETE", path);
    }
    async request(method, path, body) {
        const accessToken = await this.oauthManager.getValidAccessToken();
        const url = `${GoogleCalendarAPI.BASE_URL}${path}`;
        const headers = {
            Authorization: `Bearer ${accessToken}`
        };
        let requestBody;
        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            requestBody = JSON.stringify(body);
        }
        const response = await fetch(url, {
            method,
            headers,
            body: requestBody
        });
        if (!response.ok) {
            const apiError = await this.parseApiError(response);
            const err = new Error(`[GoogleCalendarAPI] ${method} ${path} failed: ${apiError.code} ${apiError.message}`);
            err.apiError = apiError;
            throw err;
        }
        if (response.status === 204) {
            return undefined;
        }
        return await response.json();
    }
    /**
     * Chuẩn hóa lỗi trả về từ Google API để debug dễ hơn.
     */
    async parseApiError(response) {
        const fallback = {
            code: response.status,
            message: response.statusText || "Unknown Google API error"
        };
        try {
            const json = await response.json();
            if (!json?.error)
                return fallback;
            return {
                code: json.error.code ?? response.status,
                message: json.error.message ?? fallback.message,
                status: json.error.status,
                details: json.error.errors
            };
        }
        catch {
            return fallback;
        }
    }
    getTimezone() {
        const tz = this.plugin.settings.timezone?.trim();
        return tz || DEFAULT_TIMEZONE;
    }
    assertRequired(value, fieldName) {
        if (!value?.trim()) {
            throw new Error(`[GoogleCalendarAPI] Thiếu trường bắt buộc: ${fieldName}`);
        }
    }
    validateEventPayload(event) {
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
GoogleCalendarAPI.BASE_URL = "https://www.googleapis.com/calendar/v3";
