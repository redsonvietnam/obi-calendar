import { requestUrl, RequestUrlResponse } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { OAuthManager } from "./OAuthManager";
import {
    GoogleTask,
    GoogleTaskList,
    DEFAULT_TIMEZONE
} from "./types";
import { Logger } from "./Logger";
import { RetryUtils } from "./RetryUtils";


export interface ListTaskListsParams {
    maxResults?: number;
}

export interface ListTasksParams {
    tasklist?: string;
    maxResults?: number;
    showCompleted?: boolean;
    showDeleted?: boolean;
    showHidden?: boolean;
    pageToken?: string;
    sortBy?: "newList" | "due" | "updated";
    // Add other relevant parameters from Google Tasks API documentation
}

export interface GoogleTasksAPIError {
    code: number;
    message: string;
    status?: string;
    details?: unknown;
}

interface ListTaskListsResponse {
    kind: string;
    etag: string;
    items: GoogleTaskList[];
    nextPageToken?: string;
}

interface ListTasksResponse {
    kind: string;
    etag: string;
    items: GoogleTask[];
    nextPageToken?: string;
    nextSyncToken?: string;
}

export class GoogleTasksAPI {
    private static readonly BASE_URL = "https://www.googleapis.com/tasks/v1";

    private plugin: ObsidianCalendarAgentPlugin;
    private oauthManager: OAuthManager;

    constructor(plugin: ObsidianCalendarAgentPlugin, oauthManager: OAuthManager) {
        this.plugin = plugin;
        this.oauthManager = oauthManager;
    }

    /**
     * List task lists from Google Tasks.
     */
    async listTaskLists(params: ListTaskListsParams = {}): Promise<GoogleTaskList[]> {
        const query = new URLSearchParams();
        if (params.maxResults) query.set("maxResults", String(params.maxResults));

        const queryString = query.toString();
        const path = queryString ? `/users/@me/lists?${queryString}` : `/users/@me/lists`;
        const response = await this.request<ListTaskListsResponse>("GET", path);

        return response.items ?? [];
    }

    /**
     * Get a specific task list.
     */
    async getTaskList(tasklistId: string): Promise<GoogleTaskList> {
        this.assertRequired(tasklistId, "tasklistId");
        const path = `/users/@me/lists/${encodeURIComponent(tasklistId)}`;
        return this.request<GoogleTaskList>("GET", path);
    }

    /**
     * Create a new task list.
     */
    async createTaskList(title: string): Promise<GoogleTaskList> {
        this.assertRequired(title, "title");
        const body = { title };
        const path = `/users/@me/lists`;
        return this.request<GoogleTaskList>("POST", path, body);
    }

    /**
     * Delete a task list.
     */
    async deleteTaskList(tasklistId: string): Promise<void> {
        this.assertRequired(tasklistId, "tasklistId");
        const path = `/users/@me/lists/${encodeURIComponent(tasklistId)}`;
        await this.request<void>("DELETE", path);
    }

    /**
     * List tasks within a specific task list.
     */
    async listTasks(params: ListTasksParams = {}): Promise<GoogleTask[]> {
        const tasklistId = params.tasklist ?? "@default"; // Use "@default" for the primary task list
        this.assertRequired(tasklistId, "tasklist");

        const query = new URLSearchParams();
        if (params.maxResults) query.set("maxResults", String(params.maxResults));
        if (params.showCompleted !== undefined) query.set("showCompleted", String(params.showCompleted));
        if (params.showDeleted !== undefined) query.set("showDeleted", String(params.showDeleted));
        if (params.showHidden !== undefined) query.set("showHidden", String(params.showHidden));
        if (params.pageToken) query.set("pageToken", params.pageToken);
        if (params.sortBy) query.set("sortBy", String(params.sortBy));

        const queryString = query.toString();
        const path = queryString
            ? `/lists/${encodeURIComponent(tasklistId)}/tasks?${queryString}`
            : `/lists/${encodeURIComponent(tasklistId)}/tasks`;
        const response = await this.request<ListTasksResponse>("GET", path);

        return response.items ?? [];
    }

    /**
     * Get a specific task.
     */
    async getTask(tasklistId: string, taskId: string): Promise<GoogleTask> {
        this.assertRequired(tasklistId, "tasklistId");
        this.assertRequired(taskId, "taskId");
        const path = `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`;
        return this.request<GoogleTask>("GET", path);
    }

    /**
     * Create a new task.
     */
    async createTask(tasklistId: string, task: Partial<GoogleTask>): Promise<GoogleTask> {
        this.assertRequired(tasklistId, "tasklistId");
        this.validateTaskPayload(task);
        const path = `/lists/${encodeURIComponent(tasklistId)}/tasks`;
        return this.request<GoogleTask>("POST", path, task);
    }

    /**
     * Update an existing task.
     */
    async updateTask(tasklistId: string, taskId: string, task: Partial<GoogleTask>): Promise<GoogleTask> {
        this.assertRequired(tasklistId, "tasklistId");
        this.assertRequired(taskId, "taskId");
        this.validateTaskPayload(task);
        const path = `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`;
        return this.request<GoogleTask>("PUT", path, task);
    }

    /**
     * Patch an existing task (partially update).
     */
    async patchTask(tasklistId: string, taskId: string, partial: Partial<GoogleTask>): Promise<GoogleTask> {
        this.assertRequired(tasklistId, "tasklistId");
        this.assertRequired(taskId, "taskId");
        const path = `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`;
        return this.request<GoogleTask>("PATCH", path, partial);
    }

    /**
     * Delete a task.
     */
    async deleteTask(tasklistId: string, taskId: string): Promise<void> {
        this.assertRequired(tasklistId, "tasklistId");
        this.assertRequired(taskId, "taskId");
        const path = `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`;
        await this.request<void>("DELETE", path);
    }

    private async request<T>(
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        path: string,
        body?: unknown
    ): Promise<T> {
        return RetryUtils.withRetry(
            async () => {
                const accessToken = await this.oauthManager.getValidAccessToken();
                if (!accessToken) {
                    throw new Error("[GoogleTasksAPI] Không có access token hợp lệ. Vui lòng kiểm tra cài đặt OAuth.");
                }

                const url = `${GoogleTasksAPI.BASE_URL}${path}`;
                Logger.debug("GoogleTasksAPI", `Calling URL: ${url}`);

                const headers: Record<string, string> = {
                    Authorization: `Bearer ${accessToken}`
                };
                Logger.debug("GoogleTasksAPI", `Headers:`, headers);

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
                    Logger.error("GoogleTasksAPI", `Request failed: ${method} ${url}`, response);
                    const err = new Error(
                        `[GoogleTasksAPI] ${method} ${path} failed: ${apiError.code} ${apiError.message}. Chi tiết: ${JSON.stringify(apiError.details)}`
                    ) as Error & { apiError?: GoogleTasksAPIError };
                    err.apiError = apiError;
                    throw err;
                }

                if (response.status === 204) {
                    return undefined as T;
                }

                return response.json as T;
            },
            { maxRetries: 3, initialDelay: 1000, backoffFactor: 2 },
            (attempt, error) => {
                Logger.warn("GoogleTasksAPI", `Retry attempt ${attempt} for ${method} ${path}`, error);
            }
        );
    }

    private parseApiError(response: RequestUrlResponse): GoogleTasksAPIError {
        let textBody = "";
        try {
            if (response.arrayBuffer) {
                const decoder = new TextDecoder("utf-8");
                textBody = decoder.decode(response.arrayBuffer).slice(0, 500);
            }
        } catch {}

        const fallback: GoogleTasksAPIError = {
            code: response.status,
            message: `Unknown Google Tasks API error. Body: ${textBody}`
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

    private assertRequired(value: string | undefined, fieldName: string): void {
        if (!value?.trim()) {
            throw new Error(`[GoogleTasksAPI] Thiếu trường bắt buộc: ${fieldName}`);
        }
    }

    private validateTaskPayload(task: Partial<GoogleTask>): void {
        if (!task) {
            throw new Error("[GoogleTasksAPI] Task payload không được rỗng.");
        }
        if (!task.title?.trim()) {
            throw new Error("[GoogleTasksAPI] Task phải có tiêu đề.");
        }
        // Add other validations as needed, e.g., for due date format
    }
}