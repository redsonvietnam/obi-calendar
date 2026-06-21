import { GeminiAgent, AgentRunResult } from "../src/GeminiAgent";
import { CalendarTools } from "../src/CalendarTools";
import { Plugin } from "obsidian";
import { requestUrl } from "obsidian";

jest.mock("obsidian", () => ({
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
        app = { vault: { getName: () => "TestVault" } };
        async loadData() { return {}; }
        async saveData() { return; }
    }
}));

describe("GeminiAgent", () => {
    let plugin: Plugin;
    let tools: CalendarTools;
    let agent: GeminiAgent;

    beforeEach(() => {
        jest.clearAllMocks();
        plugin = new Plugin();
        tools = {
            executeTool: jest.fn(),
            getGeminiToolDeclarations: jest.fn().mockReturnValue([])
        } as any;
        agent = new GeminiAgent(plugin, tools);
    });

    describe("constructor", () => {
        test("should create agent instance", () => {
            expect(agent).toBeInstanceOf(GeminiAgent);
        });
    });

    describe("run", () => {
        test("should throw if API key is missing", async () => {
            (plugin.settings as any).geminiApiKey = "";
            await expect(
                agent.run("Hello", [], "UTC", "{}")
            ).rejects.toThrow("Thiếu Gemini API key");
        });

        test("should throw if API key is whitespace only", async () => {
            (plugin.settings as any).geminiApiKey = "   ";
            await expect(
                agent.run("Hello", [], "UTC", "{}")
            ).rejects.toThrow("Thiếu Gemini API key");
        });

        test("should return text response when model returns text directly", async () => {
            const mockResponse = {
                candidates: [{
                    content: {
                        role: "model",
                        parts: [{ text: "Xin chào! Tôi có thể giúp gì?" }]
                    }
                }]
            };

            const generateContentSpy = jest.spyOn(agent as any, "generateContent");
            generateContentSpy.mockResolvedValue(mockResponse);

            const result = await agent.run("Hello", [], "UTC", "{}");
            expect(result.assistantText).toBe("Xin chào! Tôi có thể giúp gì?");
            expect(result.toolTrace).toHaveLength(0);
        });

        test("should execute tool call and return response", async () => {
            const mockFunctionResponse = {
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

            const mockFinalResponse = {
                candidates: [{
                    content: {
                        role: "model",
                        parts: [{ text: "Đã tìm thấy 5 sự kiện." }]
                    }
                }]
            };

            const generateContentSpy = jest.spyOn(agent as any, "generateContent");
            generateContentSpy
                .mockResolvedValueOnce(mockFunctionResponse)
                .mockResolvedValueOnce(mockFinalResponse);

            (tools.executeTool as jest.Mock).mockResolvedValue({
                ok: true,
                data: { events: [] }
            });

            const result = await agent.run("Liệt kê sự kiện", [], "UTC", "{}");
            expect(result.assistantText).toBe("Đã tìm thấy 5 sự kiện.");
            expect(result.toolTrace).toHaveLength(1);
            expect(result.toolTrace[0].toolName).toBe("list_events");
        });

        test("should handle tool execution failure", async () => {
            const mockFunctionResponse = {
                candidates: [{
                    content: {
                        role: "model",
                        parts: [{
                            functionCall: {
                                name: "create_event",
                                args: { summary: "Test" }
                            }
                        }]
                    }
                }]
            };

            const mockFinalResponse = {
                candidates: [{
                    content: {
                        role: "model",
                        parts: [{ text: "Xin lỗi, có lỗi xảy ra." }]
                    }
                }]
            };

            const generateContentSpy = jest.spyOn(agent as any, "generateContent");
            generateContentSpy
                .mockResolvedValueOnce(mockFunctionResponse)
                .mockResolvedValueOnce(mockFinalResponse);

            (tools.executeTool as jest.Mock).mockResolvedValue({
                ok: false,
                error: "Missing required fields"
            });

            const result = await agent.run("Tạo sự kiện lỗi", [], "UTC", "{}");
            expect(result.toolTrace[0].result.ok).toBe(false);
        });

        test("should throw on empty model content", async () => {
            const mockResponse = {
                candidates: [{
                    content: {
                        role: "model",
                        parts: []
                    }
                }]
            };

            const generateContentSpy = jest.spyOn(agent as any, "generateContent");
            generateContentSpy.mockResolvedValue(mockResponse);

            await expect(
                agent.run("Hello", [], "UTC", "{}")
            ).rejects.toThrow("Gemini không trả nội dung hợp lệ");
        });

        test("should throw when no candidates returned", async () => {
            const mockResponse = {
                candidates: []
            };

            const generateContentSpy = jest.spyOn(agent as any, "generateContent");
            generateContentSpy.mockResolvedValue(mockResponse);

            await expect(
                agent.run("Hello", [], "UTC", "{}")
            ).rejects.toThrow("Gemini không trả nội dung hợp lệ");
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
            generateContentSpy.mockResolvedValue(mockResponse);

            const result = await agent.run("Phân tích hình", [], "UTC", "{}", undefined, "base64imagedata");
            expect(result.assistantText).toBe("Tôi thấy hình ảnh.");
        });

        test("should handle abort signal", async () => {
            const controller = new AbortController();
            controller.abort();

            await expect(
                agent.run("Hello", [], "UTC", "{}", controller.signal)
            ).rejects.toThrow("Operation cancelled");
        });

        test("should throw after max tool rounds (6)", async () => {
            const mockFunctionResponse = {
                candidates: [{
                    content: {
                        role: "model",
                        parts: [{
                            functionCall: {
                                name: "list_events",
                                args: {}
                            }
                        }]
                    }
                }]
            };

            const generateContentSpy = jest.spyOn(agent as any, "generateContent");
            // Always return function calls to exhaust rounds
            generateContentSpy.mockResolvedValue(mockFunctionResponse);

            (tools.executeTool as jest.Mock).mockResolvedValue({
                ok: true,
                data: []
            });

            await expect(
                agent.run("Complex task", [], "UTC", "{}")
            ).rejects.toThrow("Vượt quá số vòng");
        });

        test("should pass history to generateContent", async () => {
            const mockResponse = {
                candidates: [{
                    content: {
                        role: "model",
                        parts: [{ text: "Response" }]
                    }
                }]
            };

            const generateContentSpy = jest.spyOn(agent as any, "generateContent");
            generateContentSpy.mockResolvedValue(mockResponse);

            const history = [
                { role: "user" as const, parts: [{ text: "Previous message" }] }
            ];

            await agent.run("Follow up", history, "UTC", "{}");

            expect(generateContentSpy).toHaveBeenCalledTimes(1);
            const calledContents = generateContentSpy.mock.calls[0][1] as any[];
            // Should have systemTurn, history item, and current message
            expect(calledContents.length).toBeGreaterThanOrEqual(3);
        });

        test("should return default text when model returns empty text", async () => {
            const mockResponse = {
                candidates: [{
                    content: {
                        role: "model",
                        parts: [{ text: "" }]
                    }
                }]
            };

            const generateContentSpy = jest.spyOn(agent as any, "generateContent");
            generateContentSpy.mockResolvedValue(mockResponse);

            const result = await agent.run("Hello", [], "UTC", "{}");
            expect(result.assistantText).toBe("Đã xử lý xong.");
        });
    });
});
