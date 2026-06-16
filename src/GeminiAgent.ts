import { requestUrl } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import {
    CalendarTools,
    ToolCallRequest,
    ToolExecutionResult
} from "./CalendarTools";
import { GeminiContent, GeminiPart } from "./types";

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

    private buildSystemPrompt(timezone: string, vaultSnapshot: string): string {
        return `
Bạn là "Calendar Agent", một trợ lý AI thông minh được tích hợp vào Obsidian.
Mục tiêu chính của bạn là giúp người dùng quản lý Google Calendar và Obsidian Vault bằng cách phân tích ghi chú và sắp xếp lịch trình.

Thời gian hiện tại: ${new Date().toLocaleString('vi-VN')}
Timezone người dùng: ${timezone}

BỐI CẢNH VAULT (VAULT CONTEXT):
${vaultSnapshot}

KHẢ NĂNG CỦA BẠN:
1. **Quản lý Google Calendar**: Liệt kê, tạo, cập nhật, vá (patch) và xóa sự kiện.
2. **Quản lý Google Tasks**: Liệt kê danh sách task, tạo, cập nhật và xóa các công việc trong Google Tasks.
3. **Phân tích ghi chú**: Bạn có thể đọc và phân tích các ghi chú hỗn loạn để trích xuất sự kiện, deadline và công việc.
4. **Nhận thức Vault**: Bạn có quyền truy cập vào Daily Notes, các Task đang mở và các ghi chú dự án.

HƯỚNG DẪN:
- **Ngôn ngữ**: Sử dụng tiếng Việt cho tất cả các giao tiếp.
- **Deep Linking**: Khi tạo hoặc cập nhật sự kiện/task từ một ghi chú, **LUÔN LUÔN** cung cấp \`sourceNotePath\` (đường dẫn file Obsidian) để tạo liên kết sâu (deep link).
- **Cập nhật thông minh**: Khi người dùng muốn thay đổi sự kiện/task (VD: "dời lịch họp mai sang 3h chiều"), hãy:
    1. Sử dụng \`list_events\` hoặc \`list_tasks\` để tìm đúng sự kiện/task đó và lấy \`eventId\` hoặc \`taskId\`.
    2. Sử dụng \`update_event\` hoặc \`patch_task\` với thông tin mới.
- **Kiểm tra xung đột (Conflict Detection)**: Trước khi tạo một sự kiện mới, hãy **LUÔN LUÔN** sử dụng \`list_events\` để kiểm tra xem khung giờ đó đã có sự kiện nào khác chưa. Nếu có xung đột, hãy thông báo cho người dùng và đề xuất một khung giờ trống thay thế.
- **Phân loại Thông minh**:
    - **Sự kiện (Calendar)**: Dùng cho các cuộc hẹn, cuộc họp, hoặc sự kiện có thời gian bắt đầu và kết thúc cụ thể.
    - **Công việc (Tasks)**: Dùng cho các đầu việc cần hoàn thành, deadline, hoặc các mục "to-do" không nhất thiết phải chiếm một khối thời gian cố định trên lịch.
- **Lập lịch thông minh**: Nếu ngày tháng mang tính tương đối (VD: "mai", "thứ 6 tới"), hãy tính toán dựa trên Thời gian hiện tại.
- **Xác nhận**: Đối với nhiều sự kiện, hãy liệt kê rõ ràng và hỏi ý kiến người dùng trước khi tạo.
- **Cập nhật ghi chú**: Khi người dùng yêu cầu phân tích/dọn dẹp một ghi chú, hãy **chủ động** sử dụng công cụ \`write_vault_note\` để sắp xếp lại nội dung ghi chú một cách khoa học và dùng \`append_vault_note\` để lưu lại danh sách sự kiện đã tạo ở cuối ghi chú.

HƯỚNG DẪN CỤ THỂ CHO GHI CHÚ HỖN LOẠN:
- Tìm kiếm các từ khóa như "họp", "deadline", "gặp", "đi", "làm", "xong".
- Suy luận ngày tháng từ ngữ cảnh nếu có thể (VD: nếu ghi chú là Daily Note, hãy giả định là "hôm nay").
- Nếu ghi chú chứa danh sách các task không có thời gian, hãy đề xuất các khối thời gian hợp lý hoặc đặt chúng là sự kiện cả ngày trên Google Calendar.
- Sau khi phân tích và tạo lịch, hãy sử dụng \`write_vault_note\` để tổ chức lại ghi chú đó: thêm phần lịch trình đã đồng bộ hóa vào ghi chú gốc để người dùng biết lịch trình đã được liên kết thành công.

Hãy ngắn gọn, hữu ích và tập trung vào việc giảm bớt gánh nặng ghi nhớ cho người dùng.
`;
    }

    /**
     * Chạy vòng lặp agent:
     * 1) gửi user message
     * 2) nếu model gọi tool -> execute tool
     * 3) gửi functionResponse lại cho model
     * 4) lặp đến khi model trả text cuối
     */
    async run(
        userMessage: string,
        history: GeminiContent[] = [],
        timezone: string,
        vaultSnapshot: string,
        signal?: AbortSignal,
        excludedTools?: string[],
        imageBase64?: string
    ): Promise<AgentRunResult & { updatedHistory: GeminiContent[] }> {
        const apiKey = this.plugin.settings.geminiApiKey?.trim();
        if (!apiKey) {
            throw new Error("Thiếu Gemini API key trong settings.");
        }

        const systemTurn: GeminiContent = {
            role: "user",
            parts: [{ text: this.buildSystemPrompt(timezone, vaultSnapshot) }]
        };

        const userParts: GeminiPart[] = [{ text: userMessage }];
        if (imageBase64) {
            userParts.push({
                inlineData: {
                    mimeType: "image/jpeg",
                    data: imageBase64.replace(/^data:image\/\w+;base64,/, "")
                }
            });
        }

        const contents: GeminiContent[] = [
            systemTurn,
            ...history,
            { role: "user", parts: userParts }
        ];

        const toolTrace: AgentRunResult["toolTrace"] = [];
        const maxToolRounds = 6;

        for (let round = 0; round < maxToolRounds; round += 1) {
            if (signal?.aborted) {
                throw new Error("Operation cancelled by user.");
            }

            const response = await this.generateContent(apiKey, contents, excludedTools);
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
                    toolTrace,
                    // Exclude systemTurn from updatedHistory
                    updatedHistory: contents.slice(1)
                };
            }

            const fn = functionCallPart.functionCall;
            const call: ToolCallRequest = {
                name: fn.name,
                arguments: fn.args ?? {}
            };

            // Check for abortion before executing tool
            if (signal?.aborted) {
                throw new Error("Operation cancelled by user.");
            }

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
        contents: GeminiContent[],
        excludedTools?: string[]
    ): Promise<GeminiGenerateContentResponse> {
        const body = {
            contents,
            tools: [
                {
                    functionDeclarations: this.tools.getGeminiToolDeclarations(excludedTools)
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
            const response = await requestUrl({
                url: endpoint,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                body: JSON.stringify(body),
                throw: false
            });

            if (response.status >= 200 && response.status < 300) {
                return response.json as GeminiGenerateContentResponse;
            }

            const text = response.text;
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