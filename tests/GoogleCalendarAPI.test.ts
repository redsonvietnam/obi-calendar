import { GoogleCalendarAPI, ListEventsParams } from "../src/GoogleCalendarAPI";
import { OAuthManager } from "../src/OAuthManager";
import { Plugin } from "obsidian";
import { requestUrl } from "obsidian";

// Mock obsidian
jest.mock("obsidian", () => {
    return {
        Notice: jest.fn(),
        requestUrl: jest.fn(),
        Plugin: class {
            settings = {
                timezone: "Asia/Ho_Chi_Minh"
            };
            async loadData() { return {}; }
            async saveData(data: any) { return; }
        }
    };
});

describe("GoogleCalendarAPI", () => {
    let plugin: Plugin;
    let oauthManager: OAuthManager;
    let api: GoogleCalendarAPI;

    beforeEach(() => {
        jest.clearAllMocks();
        plugin = new Plugin();
        oauthManager = new OAuthManager(plugin);
        
        // Mock getValidAccessToken to return a token
        (oauthManager.getValidAccessToken as jest.Mock) = jest.fn().mockResolvedValue("test-access-token");
        
        api = new GoogleCalendarAPI(plugin, oauthManager);
    });

    describe("listEvents", () => {
        test("should call correct endpoint with default params", async () => {
            const mockResponse = {
                status: 200,
                json: {
                    items: [
                        { id: "1", summary: "Event 1", start: { dateTime: "2026-01-01T10:00:00Z" }, end: { dateTime: "2026-01-01T11:00:00Z" } }
                    ]
                }
            };
            (requestUrl as jest.Mock).mockResolvedValue(mockResponse);

            const events = await api.listEvents();

            expect(events).toHaveLength(1);
            expect(events[0].summary).toBe("Event 1");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                url: expect.stringContaining("/calendars/primary/events"),
                method: "GET"
            }));
        });

        test("should apply custom params correctly", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 200, json: { items: [] } });

            await api.listEvents({
                calendarId: "my-cal",
                q: "meeting",
                maxResults: 5
            });

            const calledUrl = (requestUrl as jest.Mock).mock.calls[0][0].url;
            expect(calledUrl).toContain("/calendars/my-cal/events");
            expect(calledUrl).toContain("q=meeting");
            expect(calledUrl).toContain("maxResults=5");
        });
    });

    describe("createEvent", () => {
        test("should successfully create an event", async () => {
            const event = {
                summary: "New Event",
                start: { dateTime: "2026-01-01T10:00:00Z" },
                end: { dateTime: "2026-01-01T11:00:00Z" }
            };
            
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 201,
                json: { id: "new-id", ...event }
            });

            const result = await api.createEvent("primary", event);
            expect(result.id).toBe("new-id");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                method: "POST",
                body: JSON.stringify(event)
            }));
        });

        test("should throw error if payload is invalid", async () => {
            const invalidEvent = { summary: "No start/end" } as any;
            await expect(api.createEvent("primary", invalidEvent)).rejects.toThrow("Event phải có start và end");
        });
    });

    describe("patchEvent", () => {
        test("should successfully patch an event", async () => {
            const patch = { summary: "Updated Title" };
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 200,
                json: { id: "1", summary: "Updated Title", start: {}, end: {} }
            });

            const result = await api.patchEvent("primary", "event-123", patch);
            expect(result.summary).toBe("Updated Title");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                method: "PATCH",
                url: expect.stringContaining("/events/event-123")
            }));
        });
    });

    describe("deleteEvent", () => {
        test("should successfully delete an event", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({ status: 204 });

            await api.deleteEvent("primary", "event-123");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                method: "DELETE",
                url: expect.stringContaining("/events/event-123")
            }));
        });

        test("should throw error if delete fails", async () => {
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 404,
                json: { error: { code: 404, message: "Not Found" } }
            });

            await expect(api.deleteEvent("primary", "invalid-id")).rejects.toThrow("[GoogleCalendarAPI] DELETE");
        });
    });
});
