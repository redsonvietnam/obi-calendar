import { GeminiAgent, AgentRunResult } from "../src/GeminiAgent";
import { CalendarTools } from "../src/CalendarTools";
import { GoogleCalendarAPI } from "../src/GoogleCalendarAPI";
import { GoogleTasksAPI } from "../src/GoogleTasksAPI";
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
                geminiApiKey: "test-gemini-key",
                timezone: "Asia/Ho_Chi_Minh",
                googleClientId: "test-id",
                googleClientSecret: "test-secret",
                googleRedirectUri: "http://localhost/callback"
            };
            async loadData() { return {}; }
            async saveData(data: any) { return; }
        }
    };
});

describe("Agent Loop Integration", () => {
    let plugin: Plugin;
    let oauthManager: OAuthManager;
    let calendarApi: GoogleCalendarAPI;
    let tasksApi: GoogleTasksAPI;
    let tools: CalendarTools;
    let agent: GeminiAgent;

    beforeEach(() => {
        jest.clearAllMocks();
        plugin = new Plugin();
        oauthManager = new OAuthManager(plugin);
        
        // Mock OAuth to always return a valid token
        (oauthManager.getValidAccessToken as jest.Mock) = jest.fn().mockResolvedValue("valid-token");
        
        calendarApi = new GoogleCalendarAPI(plugin, oauthManager);
        tasksApi = new GoogleTasksAPI(plugin, oauthManager);
        
        tools = new CalendarTools({
            plugin,
            calendarApi,
            googleTasksApi: tasksApi,
            oauthManager,
            vaultContext: { buildSnapshot: jest.fn().mockResolvedValue({}) } as any,
            safetyLayer: { requestConfirmation: jest.fn().mockResolvedValue(true), undoLast: jest.fn() } as any
        });

        agent = new GeminiAgent(plugin, tools);
    });

    test("should execute a simple tool call loop (list events)", async () => {
        // 1. Mock Gemini to return a function call for 'list_events'
        const mockGeminiResponse = {
            candidates: [{
                content: {
                    role: "model",
                    parts: [{
                        functionCall: {
                            name: "list_events",
                            args: { maxResults: 5 }
                        }
                    }]
                }
            }]
        };

        // Mock the second Gemini response after tool execution
        const mockFinalResponse = {
            candidates: [{
                content: {
                    role: "model",
                    parts: [{ text: "Tôi đã tìm thấy 5 sự kiện trong lịch của bạn." }]
                }
            }]
        };

        // We need to mock the internal generateContent method of GeminiAgent
        const generateContentSpy = jest.spyOn(agent as any, "generateContent");
        generateContentSpy
            .mockResolvedValueOnce(mockGeminiResponse)
            .mockResolvedValueOnce(mockFinalResponse);

        // Mock Google API response
        (requestUrl as jest.Mock).mockResolvedValue({
            status: 200,
            json: { items: new Array(5).fill({ summary: "Event", start: { dateTime: "..." }, end: { dateTime: "..." } }) }
        });

        const result = await agent.run("Liệt kê 5 sự kiện tới");

        expect(result.assistantText).toBe("Tôi đã tìm thấy 5 sự kiện trong lịch của bạn.");
        expect(result.toolTrace).toHaveLength(1);
        expect(result.toolTrace[0].toolName).toBe("list_events");
        expect(requestUrl).toHaveBeenCalled();
    });

    test("should handle tool execution error gracefully", async () => {
        const mockGeminiResponse = {
            candidates: [{
                content: {
                    role: "model",
                    parts: [{
                        functionCall: {
                            name: "create_event",
                            args: { calendarId: "primary", event: { summary: "Error Event", start: { date: "2026-01-01" }, end: { date: "2026-01-02" } } }
                        }
                    }]
                }
            }]
        };

        const mockErrorResponse = {
            candidates: [{
                content: {
                    role: "model",
                    parts: [{ text: "Xin lỗi, tôi không thể tạo sự kiện vì lỗi API." }]
                }
            }]
        };

        const generateContentSpy = jest.spyOn(agent as any, "generateContent");
        generateContentSpy
            .mockResolvedValueOnce(mockGeminiResponse)
            .mockResolvedValueOnce(mockErrorResponse);

        // Mock API to fail
        (requestUrl as jest.Mock).mockResolvedValue({
            status: 400,
            text: "Invalid Request",
            json: { error: { message: "Invalid date format" } }
        });

        const result = await agent.run("Tạo sự kiện lỗi");

        expect(result.assistantText).toBe("Xin lỗi, tôi không thể tạo sự kiện vì lỗi API.");
        expect(result.toolTrace[0].result.ok).toBe(false);
            expect(result.toolTrace[0].result.error).toContain("Thiếu tham số bắt buộc: summary");
    });
});
