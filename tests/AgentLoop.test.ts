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

    test("should throw error when API key is missing", async () => {
        (plugin as any).settings.geminiApiKey = "";
        
        await expect(agent.run("Hello", [], "Asia/Ho_Chi_Minh", "")).rejects.toThrow("Thiếu Gemini API key");
    });

    test("should handle image input", async () => {
        const mockResponse = {
            candidates: [{
                content: {
                    role: "model",
                    parts: [{ text: "Tôi thấy hình ảnh." }]
                }
            }]
        };

        const generateContentSpy = jest.spyOn(agent as any, "generateContent");
        generateContentSpy.mockResolvedValueOnce(mockResponse);

        const result = await agent.run("Phân tích hình này", [], "Asia/Ho_Chi_Minh", "", undefined, undefined, "data:image/jpeg;base64,abc123");

        expect(result.assistantText).toBe("Tôi thấy hình ảnh.");
    });

    test("should handle abort signal", async () => {
        const abortController = new AbortController();
        
        // Abort before calling run
        abortController.abort();

        await expect(agent.run("Hello", [], "Asia/Ho_Chi_Minh", "", abortController.signal)).rejects.toThrow("cancelled");
    });

    test("should handle empty response from Gemini", async () => {
        const mockResponse = {
            candidates: [{
                content: {
                    role: "model",
                    parts: []
                }
            }]
        };

        const generateContentSpy = jest.spyOn(agent as any, "generateContent");
        generateContentSpy.mockResolvedValueOnce(mockResponse);

        await expect(agent.run("Hello")).rejects.toThrow("Gemini không trả nội dung hợp lệ");
    });

    test("should handle max tool rounds exceeded", async () => {
        const mockResponse = {
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

        const generateContentSpy = jest.spyOn(agent as any, "generateContent");
        generateContentSpy.mockResolvedValue(mockResponse);

        await expect(agent.run("List events forever")).rejects.toThrow("Vượt quá số vòng");
    });

    test("should handle API quota error and fallback models", async () => {
        (requestUrl as jest.Mock).mockResolvedValue({
            status: 429,
            text: "Quota exceeded",
            json: { error: { message: "Quota exceeded" } }
        });

        await expect(agent.run("Hello")).rejects.toThrow("Không gọi được model Gemini nào");
    });

    test("should handle model not found error and fallback", async () => {
        (requestUrl as jest.Mock).mockResolvedValue({
            status: 404,
            text: "Model not found",
            json: { error: { message: "Model not found" } }
        });

        await expect(agent.run("Hello")).rejects.toThrow("Không gọi được model Gemini nào");
    });

    test("should handle permission error and fallback", async () => {
        (requestUrl as jest.Mock).mockResolvedValue({
            status: 403,
            text: "Permission denied",
            json: { error: { message: "Permission denied" } }
        });

        await expect(agent.run("Hello")).rejects.toThrow("Không gọi được model Gemini nào");
    });

    test("should summarize long errors", async () => {
        const longError = "x".repeat(500);
        (requestUrl as jest.Mock).mockResolvedValue({
            status: 500,
            text: longError,
            json: { error: { message: longError } }
        });

        await expect(agent.run("Hello")).rejects.toThrow();
    });
});
