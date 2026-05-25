/**
 * Gemini agent dùng native function calling (AI Studio API key).
 * Lưu ý: dùng REST + fetch trực tiếp, không dùng SDK nặng.
 */
export class GeminiAgent {
    constructor(plugin, tools) {
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
    async run(userMessage) {
        const apiKey = this.plugin.settings.geminiApiKey?.trim();
        if (!apiKey) {
            throw new Error("Thiếu Gemini API key trong settings.");
        }
        const contents = [
            {
                role: "user",
                parts: [{ text: userMessage }]
            }
        ];
        const toolTrace = [];
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
            const call = {
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
    async generateContent(apiKey, contents) {
        const endpoint = `${GeminiAgent.API_BASE_URL}/models/${GeminiAgent.MODEL_NAME}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`[GeminiAgent] API lỗi ${response.status}: ${text}`);
        }
        return await response.json();
    }
    extractTextFromContent(content) {
        return content.parts
            .map((part) => part.text ?? "")
            .join("\n")
            .trim();
    }
}
GeminiAgent.MODEL_NAME = "gemini-2.0-flash";
GeminiAgent.API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
