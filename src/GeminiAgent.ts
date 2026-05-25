import type ObsidianCalendarAgentPlugin from "./main";
import {
    CalendarTools,
    ToolCallRequest,
    ToolExecutionResult
} from "./CalendarTools";

interface GeminiPart {
    text?: string;
    functionCall?: {
        name: string;
        args?: Record<string, unknown>;
    };
    functionResponse?: {
        name: string;
        response: Record<string, unknown>;
    };
}

interface GeminiContent {
    role: "user" | "model" | "tool";
    parts: GeminiPart[];
}

interface GeminiCandidate {
    content?: GeminiContent;
    finishReason?: string;
}

interface GeminiGenerateContentResponse {
    candidates?: GeminiCandidate[];
    promptFeedback?: unknown;
}

export interface AgentRunResult {
    assistantText: string;
    toolTrace: Array<{
        toolName: string;
        arguments: Record<string, unknown>;
        result: ToolExecutionResult;
    }>;
}

/**
 * Gemini agent dùng native function calling (AI Studio API key).
 * Lưu ý: dùng REST + fetch trực tiếp, không dùng SDK nặng.
 */
export class GeminiAgent {
    private static readonly MODEL_CANDIDATES = [
        // Ưu tiên alias "latest" giống Gemini Scribe để tăng khả năng tương thích account.
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemini-pro-latest",

        // Fallback sang các model versioned mới.
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",

        // Legacy fallback.
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b"
    ];
    private static readonly API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    private static readonly QUOTA_HELP_URL = "https://ai.google.dev/gemini-api/docs/rate-limits";

    private readonly plugin: ObsidianCalendarAgentPlugin;
    private readonly tools: CalendarTools;

    constructor(plugin: ObsidianCalendarAgentPlugin, tools: CalendarTools) {
        this.plugin = plugin;
        this.tools = tools;
    }

    /**
     * Chạy vòng lặp agent:
     * 1) gửi user message
     * 2) nếu model gọi tool -> execute tool
     * 3) gửi functionResponse lại cho model
     * 4) lặp đến khi model trả text cuối
     */
    async run(userMessage: string): Promise<AgentRunResult> {
        const apiKey = this.plugin.settings.geminiApiKey?.trim();
        if (!apiKey) {
            throw new Error("Thiếu Gemini API key trong settings.");
        }

        const contents: GeminiContent[] = [
            {
                role: "user",
                parts: [{ text: userMessage }]
            }
        ];

        const toolTrace: AgentRunResult["toolTrace"] = [];
        const maxToolRounds = 6;

        for (let round = 0; round < maxToolRounds; round += 1) {
            const response = await this.generateContent(apiKey, contents);
            const candidate = response.candidates?.[0];
            const modelContent = candidate?.content;

            if (!modelContent?.parts?.length) {
                throw new Error("Gemini không trả nội dung hợp lệ.");
            }

            contents.push(modelContent);

            const functionCallPart = modelContent.parts.find((p) => p.functionCall);
            if (!functionCallPart?.functionCall) {
                const finalText = this.extractTextFromContent(modelContent);
                return {
                    assistantText: finalText || "Đã xử lý xong.",
                    toolTrace
                };
            }

            const fn = functionCallPart.functionCall;
            const call: ToolCallRequest = {
                name: fn.name,
                arguments: fn.args ?? {}
            };

            const toolResult = await this.tools.executeTool(call);
            toolTrace.push({
                toolName: call.name,
                arguments: call.arguments,
                result: toolResult
            });

            /**
             * Trả functionResponse về model để model tiếp tục reasoning.
             * format response giữ JSON object để model parse tốt hơn.
             */
            contents.push({
                role: "tool",
                parts: [
                    {
                        functionResponse: {
                            name: call.name,
                            response: {
                                ok: toolResult.ok,
                                data: toolResult.data ?? null,
                                error: toolResult.error ?? null
                            }
                        }
                    }
                ]
            });
        }

        throw new Error("Vượt quá số vòng function calling cho phép.");
    }

    private async generateContent(
        apiKey: string,
        contents: GeminiContent[]
    ): Promise<GeminiGenerateContentResponse> {
        const body = {
            contents,
            tools: [
                {
                    functionDeclarations: this.tools.getGeminiToolDeclarations()
                }
            ],
            toolConfig: {
                functionCallingConfig: {
                    mode: "AUTO"
                }
            }
        };

        const errorDetails: string[] = [];

        for (const model of GeminiAgent.MODEL_CANDIDATES) {
            const endpoint = `${GeminiAgent.API_BASE_URL}/models/${model}:generateContent`;
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                return await response.json() as GeminiGenerateContentResponse;
            }

            const text = await response.text();
            const normalized = text.toLowerCase();
            const isQuotaError =
                response.status === 429 ||
                normalized.includes("resource_exhausted") ||
                normalized.includes("quota");
            const isModelNotFound =
                response.status === 404 ||
                normalized.includes("model not found") ||
                normalized.includes("is not found for api version");
            const isPermissionError = response.status === 401 || response.status === 403;

            const detail = `[model=${model}][status=${response.status}] ${this.summarizeError(text)}`;
            errorDetails.push(detail);

            // Quota: thử model kế tiếp.
            if (isQuotaError) {
                continue;
            }

            // Model không hỗ trợ: thử model kế tiếp.
            if (isModelNotFound) {
                continue;
            }

            // Auth/permission lỗi: thử model kế tiếp để tìm model nào còn dùng được.
            if (isPermissionError) {
                continue;
            }

            // Lỗi khác: vẫn thử model kế tiếp để tăng xác suất hoạt động.
        }

        const merged = errorDetails.join(" | ");

        throw new Error(
            `[GeminiAgent] Không gọi được model Gemini nào sau fallback. ` +
            `Đã thử: ${GeminiAgent.MODEL_CANDIDATES.join(", ")}. ` +
            `Chi tiết: ${merged}. ` +
            `Tài liệu quota: ${GeminiAgent.QUOTA_HELP_URL}`
        );
    }

    private summarizeError(raw: string): string {
        const normalized = raw.replace(/\s+/g, " ").trim();
        if (normalized.length <= 320) {
            return normalized;
        }
        return `${normalized.slice(0, 320)}...`;
    }

    private extractTextFromContent(content: GeminiContent): string {
        return content.parts
            .map((part) => part.text ?? "")
            .join("\n")
            .trim();
    }
}