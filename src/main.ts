import {
    Notice,
    Plugin,
    WorkspaceLeaf,
    TFile
} from "obsidian";
import {
    CalendarAgentSettings,
    DEFAULT_SETTINGS
} from "./types";
import { OAuthManager } from "./OAuthManager";
import { GoogleCalendarAPI } from "./GoogleCalendarAPI";
import { GoogleTasksAPI } from "./GoogleTasksAPI"; // Import GoogleTasksAPI
import { CalendarTools } from "./CalendarTools";
import { GeminiAgent } from "./GeminiAgent";
import { CalendarView } from "./CalendarView";
import { VaultContext } from "./VaultContext";
import { SafetyLayer } from "./SafetyLayer";
import { SettingsTab } from "./SettingsTab";
import { SyncManager } from "./SyncManager";
import { Logger } from "./Logger";
import { AnalysisHistory } from "./AnalysisHistory";
import { WorkCategoryConfig } from "./WorkCategoryConfig";
import { DocumentAnalyzer } from "./DocumentAnalyzer";
import { InsightsDashboard, VIEW_TYPE_INSIGHTS_DASHBOARD } from "./InsightsDashboard";

export const VIEW_TYPE_CALENDAR_AGENT = "obsidian-calendar-agent-view";

export default class ObsidianCalendarAgentPlugin extends Plugin {
    settings: CalendarAgentSettings = DEFAULT_SETTINGS;
    oauthManager!: OAuthManager;
    googleCalendarApi!: GoogleCalendarAPI;
    googleTasksApi!: GoogleTasksAPI; // Add googleTasksApi property
    calendarTools!: CalendarTools;
    geminiAgent!: GeminiAgent;
    vaultContext!: VaultContext;
    safetyLayer!: SafetyLayer;
    syncManager!: SyncManager;
    analysisHistory!: AnalysisHistory;
    workCategoryConfig!: WorkCategoryConfig;
    documentAnalyzer!: DocumentAnalyzer;

    async onload(): Promise<void> {
        try {
            await this.loadPluginSettings();

            this.oauthManager = new OAuthManager(this);
            await this.oauthManager.initialize();

            this.googleCalendarApi = new GoogleCalendarAPI(this, this.oauthManager);
            this.googleTasksApi = new GoogleTasksAPI(this, this.oauthManager); // Initialize GoogleTasksAPI
            this.vaultContext = new VaultContext(this);
            this.safetyLayer = new SafetyLayer(this);

            this.calendarTools = new CalendarTools({
                plugin: this,
                calendarApi: this.googleCalendarApi,
                googleTasksApi: this.googleTasksApi,
                oauthManager: this.oauthManager,
                vaultContext: this.vaultContext,
                safetyLayer: this.safetyLayer,
                documentAnalyzer: this.documentAnalyzer
            });
            this.geminiAgent = new GeminiAgent(this, this.calendarTools);
            this.syncManager = new SyncManager(this, this.googleTasksApi, this.googleCalendarApi);
            this.syncManager.initialize();

            this.analysisHistory = new AnalysisHistory(this);
            await this.analysisHistory.initialize();

            this.workCategoryConfig = new WorkCategoryConfig();

            this.documentAnalyzer = new DocumentAnalyzer({
                plugin: this,
                geminiAgent: this.geminiAgent,
                analysisHistory: this.analysisHistory,
                vaultContext: this.vaultContext,
                workCategoryConfig: this.workCategoryConfig
            });

            this.addSettingTab(new SettingsTab(this.app, this));

            this.registerView(VIEW_TYPE_CALENDAR_AGENT, (leaf) => {
                return new CalendarView(leaf, this);
            });

            this.registerView(VIEW_TYPE_INSIGHTS_DASHBOARD, (leaf) => {
                return new InsightsDashboard(leaf, this);
            });

            this.addCommand({
                id: "open-calendar-agent-sidebar",
                name: "Open Calendar Agent Sidebar",
                callback: async () => {
                    await this.activateView();
                }
            });

            this.addCommand({
                id: "oauth-generate-auth-url",
                name: "Calendar Agent: Generate Google OAuth URL",
                callback: async () => {
                    try {
                        const authUrl = await this.oauthManager.createAuthorizationUrl();

                        // Mở URL OAuth bằng API browser chuẩn để tránh phụ thuộc version Obsidian.
                        window.open(authUrl, "_blank");
                        new Notice("Đã mở Google OAuth URL trên trình duyệt mặc định.");
                        Logger.info("Main", "OAuth URL generated");
                    } catch (error) {
                        Logger.error("Main", "oauth generate url failed", error);
                        new Notice(`OAuth lỗi: ${(error as Error).message}`);
                    }
                }
            });

            this.addCommand({
                id: "oauth-exchange-code",
                name: "Calendar Agent: Exchange OAuth Code",
                callback: async () => {
                    try {
                        const input = window.prompt(
                            "Dán redirect URL hoặc authorization code sau khi login Google:"
                        );

                        if (!input?.trim()) {
                            new Notice("Đã hủy exchange OAuth code.");
                            return;
                        }

                        const trimmed = input.trim();
                        const code = trimmed.startsWith("http")
                            ? this.oauthManager.extractAuthorizationCodeFromRedirectUrl(trimmed)
                            : trimmed;

                        await this.oauthManager.exchangeCodeForToken(code);
                        new Notice("OAuth exchange thành công.");
                    } catch (error) {
                        Logger.error("Main", "oauth exchange failed", error);
                        new Notice(`OAuth exchange lỗi: ${(error as Error).message}`);
                    }
                }
            });

            this.addCommand({
                id: "calendar-list-events-test",
                name: "Calendar Agent: Test list events (Google Calendar)",
                callback: async () => {
                    try {
                        const events = await this.googleCalendarApi.listEvents({ maxResults: 10 });
                        new Notice(`List events OK. Số event nhận được: ${events.length}`);
                        Logger.debug("Main", "listEvents result:", events);
                    } catch (error) {
                        Logger.error("Main", "list events test failed", error);
                        new Notice(`List events lỗi: ${(error as Error).message}`);
                    }
                }
            });

            this.addCommand({
                id: "google-tasks-list-test",
                name: "Calendar Agent: Test list tasks (Google Tasks)",
                callback: async () => {
                    try {
                        const tasks = await this.googleTasksApi.listTasks({ maxResults: 10 });
                        new Notice(`List tasks OK. Số task nhận được: ${tasks.length}`);
                        Logger.debug("Main", "listTasks result:", tasks);
                    } catch (error) {
                        Logger.error("Main", "list tasks test failed", error);
                        new Notice(`List tasks lỗi: ${(error as Error).message}`);
                    }
                }
            });

            this.addCommand({
                id: "gemini-hardcoded-tool-test",
                name: "Calendar Agent: Test Gemini Function Calling (hardcoded)",
                callback: async () => {
                    try {
                        const hardcodedMessage = "Hãy liệt kê 5 sự kiện sắp tới trong lịch của tôi.";
                        const timezone = this.settings.timezone || "Asia/Ho_Chi_Minh";
                        const vaultSnapshot = JSON.stringify(await this.vaultContext.buildSnapshot(), null, 2);

                        const result = await this.geminiAgent.run(
                            hardcodedMessage,
                            [],
                            timezone,
                            vaultSnapshot
                        );

                        Logger.debug("Main", "Gemini hardcoded test result:", result);
                        new Notice(
                            `Gemini test OK. Tool calls: ${result.toolTrace.length}. Xem console để kiểm tra chi tiết.`
                        );
                    } catch (error) {
                        Logger.error("Main", "gemini hardcoded test failed", error);
                        new Notice(`Gemini test lỗi: ${(error as Error).message}`);
                    }
                }
            });

            this.addCommand({
                id: "calendar-agent-undo-last",
                name: "Calendar Agent: Undo last calendar mutation",
                callback: async () => {
                    try {
                        const ok = await this.safetyLayer.undoLast();
                        if (!ok) {
                            Logger.warn("Main", "undo last returned false");
                        }
                    } catch (error) {
                        Logger.error("Main", "undo command failed", error);
                        new Notice(`Undo lỗi: ${(error as Error).message}`);
                    }
                }
            });

            this.addCommand({
                id: "calendar-agent-vault-context-test",
                name: "Calendar Agent: Test vault context snapshot",
                callback: async () => {
                    try {
                        const snapshot = await this.vaultContext.buildSnapshot();
                        Logger.debug("Main", "vault context snapshot:", snapshot);
                        new Notice(
                            `Vault context OK. Daily: ${snapshot.dailyNotes.length}, Tasks: ${snapshot.openTasks.length}, Projects: ${snapshot.projects.length}`
                        );
                    } catch (error) {
                        Logger.error("Main", "vault context test failed", error);
                        new Notice(`Vault context lỗi: ${(error as Error).message}`);
                    }
                }
            });

            this.addCommand({
                id: "process-current-note",
                name: "📋 Phân tích ghi chú hiện tại với AI",
                callback: () => this.processCurrentNote()
            });

            this.addCommand({
                id: "scan-inbox-folder",
                name: "📥 Quét và xử lý ghi chú trong Inbox",
                callback: () => this.scanInbox()
            });

            this.addCommand({
                id: "sync-now",
                name: "🔄 Đồng bộ ngay bây giờ (Sync Now)",
                callback: async () => {
                    new Notice("Đang đồng bộ dữ liệu từ Google...");
                    try {
                        const results = await this.syncManager.syncAll();
                        new Notice(`Đồng bộ xong! Tasks: ${results.tasksUpdated}, Calendar: ${results.calendarUpdated}`);
                    } catch (error) {
                        new Notice(`Lỗi đồng bộ: ${(error as Error).message}`);
                    }
                }
            });

            this.addCommand({
                id: "analyze-document-image",
                name: "📋 Phân tích tài liệu công việc (AI)",
                callback: () => {
                    new Notice("Paste ảnh vào Calendar Agent chat để phân tích tài liệu.");
                }
            });

            this.addCommand({
                id: "show-work-insights",
                name: "📊 Xem thống kê phân tích công việc",
                callback: async () => {
                    await this.activateInsightsDashboard();
                }
            });

            this.addCommand({
                id: "recalculate-patterns",
                name: "🔄 Tính lại Work Patterns",
                callback: async () => {
                    new Notice("Đang tính lại patterns...");
                    try {
                        const categories = this.workCategoryConfig.getAllCategories();
                        for (const cat of categories) {
                            await this.analysisHistory.getPatternsForCategory(cat);
                        }
                        new Notice("✅ Đã tính lại patterns cho tất cả categories.");
                    } catch (error) {
                        new Notice(`Lỗi tính patterns: ${(error as Error).message}`);
                    }
                }
            });

            // Tự mở sidebar nếu user bật setting này
            if (this.settings.autoOpenSidebarOnStart) {
                await this.activateView();
            }

            // Lắng nghe sự kiện tạo/di chuyển file vào Inbox
            this.registerEvent(
                this.app.vault.on("create", (file) => {
                    if (file instanceof TFile) {
                        this.handleInboxFile(file);
                    }
                })
            );

            this.registerEvent(
                this.app.vault.on("rename", (file) => {
                    if (file instanceof TFile) {
                        this.handleInboxFile(file);
                    }
                })
            );
        } catch (error) {
            Logger.error("Main", "onload failed", error);
            new Notice("Calendar Agent: Plugin load thất bại. Xem console để biết chi tiết.");
            throw error;
        }
    }

    async onunload(): Promise<void> {
        try {
            if (this.syncManager) {
                this.syncManager.stop();
            }
            await this.app.workspace.detachLeavesOfType(VIEW_TYPE_CALENDAR_AGENT);
        } catch (error) {
            Logger.error("Main", "onunload failed", error);
        }
    }

    getCalendarView(): CalendarView | null {
        const { workspace } = this.app;
        const leaf = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR_AGENT)[0];
        if (leaf && leaf.view instanceof CalendarView) {
            return leaf.view;
        }
        return null;
    }

    async processCurrentNote(): Promise<void> {
        const view = this.getCalendarView();
        if (view) {
            await view.processNoteProposal();
        } else {
            new Notice("Calendar Agent sidebar chưa mở. Vui lòng mở sidebar trước.");
        }
    }

    async scanInbox(): Promise<void> {
        const inboxFolder = this.settings.inboxFolder;
        if (!inboxFolder) {
            new Notice("Chưa cấu hình Inbox Folder trong Settings.");
            return;
        }

        const files = this.app.vault.getFiles().filter(f => f.path.startsWith(inboxFolder));
        if (files.length === 0) {
            new Notice(`Không tìm thấy ghi chú nào trong folder: ${inboxFolder}`);
            return;
        }

        const view = this.getCalendarView();
        if (!view) {
            new Notice("Calendar Agent sidebar chưa mở. Vui lòng mở sidebar trước.");
            return;
        }

        new Notice(`Đang quét ${files.length} ghi chú trong ${inboxFolder}...`);

        for (const file of files) {
            const content = await this.app.vault.read(file);
            const prompt = [
                `Tôi muốn bạn xử lý ghi chú từ Inbox này:`,
                `File: ${file.path}`,
                `Nội dung:`,
                `---`,
                content,
                `---`,
                `Yêu cầu:`,
                `1. Phân tích nội dung để trích xuất sự kiện và công việc.`,
                `2. Đưa vào Google Calendar/Tasks.`,
                `3. Sắp xếp lại nội dung file này trong Obsidian bằng \`write_vault_note\`.`,
                `4. Tóm tắt kết quả.`
            ].join('\n');

            await view.sendMessage(prompt);
        }
    }

    async handleInboxFile(file: TFile): Promise<void> {
        const inboxFolder = this.settings.inboxFolder;
        if (!inboxFolder || !file.path.startsWith(inboxFolder)) {
            return;
        }

        new Notice(`📥 Phát hiện ghi chú mới trong Inbox: ${file.name}`);

        const view = this.getCalendarView();
        if (view) {
            await view.sendMessage(
                `Tôi thấy bạn vừa thêm ghi chú "${file.name}" vào Inbox. Bạn có muốn tôi phân tích và sắp xếp nó ngay bây giờ không?`
            );
        }
    }

    async activateView(): Promise<void> {
        try {
            const { workspace } = this.app;
            let leaf: WorkspaceLeaf | null =
                workspace.getLeavesOfType(VIEW_TYPE_CALENDAR_AGENT)[0] ?? null;

            if (!leaf) {
                leaf = workspace.getRightLeaf(false);
                if (!leaf) {
                    throw new Error("Không thể tạo sidebar leaf.");
                }

                await leaf.setViewState({
                    type: VIEW_TYPE_CALENDAR_AGENT,
                    active: true
                });
            }

            if (!leaf) {
                throw new Error("Không tìm thấy leaf để hiển thị.");
            }

            workspace.revealLeaf(leaf);
        } catch (error) {
            Logger.error("Main", "activateView failed", error);
            new Notice("Calendar Agent: Không mở được sidebar.");
        }
    }

    async activateInsightsDashboard(): Promise<void> {
        try {
            const { workspace } = this.app;
            let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_INSIGHTS_DASHBOARD)[0] ?? null;
            if (!leaf) {
                leaf = workspace.getRightLeaf(false);
                if (!leaf) {
                    throw new Error("Không thể tạo sidebar leaf.");
                }
                await leaf.setViewState({ type: VIEW_TYPE_INSIGHTS_DASHBOARD, active: true });
            }
            workspace.revealLeaf(leaf);
        } catch (error) {
            Logger.error("Main", "activateInsightsDashboard failed", error);
            new Notice("Không mở được Insights Dashboard.");
        }
    }

    async loadPluginSettings(): Promise<void> {
        try {
            const loaded = await this.loadData();
            this.settings = {
                ...DEFAULT_SETTINGS,
                ...(loaded?.settings ?? {})
            };
        } catch (error) {
            Logger.error("Main", "load settings failed", error);
            this.settings = { ...DEFAULT_SETTINGS };
        }
    }

    async savePluginSettings(): Promise<void> {
        try {
            const base = (await this.loadData()) ?? {};
            base.settings = this.settings;
            await this.saveData(base);

            // Restart auto-sync to apply new settings (interval, enabled, etc.)
            if (this.syncManager) {
                this.syncManager.startAutoSync();
            }
        } catch (error) {
            Logger.error("Main", "save settings failed", error);
            new Notice("Calendar Agent: Không lưu được settings.");
        }
    }
}
