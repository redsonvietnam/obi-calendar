import {
    Notice,
    Plugin,
    WorkspaceLeaf
} from "obsidian";
import {
    CalendarAgentSettings,
    DEFAULT_SETTINGS
} from "./types";
import { OAuthManager } from "./OAuthManager";
import { GoogleCalendarAPI } from "./GoogleCalendarAPI";
import { CalendarTools } from "./CalendarTools";
import { GeminiAgent } from "./GeminiAgent";
import { CalendarView } from "./CalendarView";
import { VaultContext } from "./VaultContext";
import { SafetyLayer } from "./SafetyLayer";
import { SettingsTab } from "./SettingsTab";

export const VIEW_TYPE_CALENDAR_AGENT = "obsidian-calendar-agent-view";

export default class ObsidianCalendarAgentPlugin extends Plugin {
    settings: CalendarAgentSettings = DEFAULT_SETTINGS;
    oauthManager!: OAuthManager;
    googleCalendarApi!: GoogleCalendarAPI;
    calendarTools!: CalendarTools;
    geminiAgent!: GeminiAgent;
    vaultContext!: VaultContext;
    safetyLayer!: SafetyLayer;

    async onload(): Promise<void> {
        try {
            await this.loadPluginSettings();

            this.oauthManager = new OAuthManager(this);
            await this.oauthManager.initialize();

            this.googleCalendarApi = new GoogleCalendarAPI(this, this.oauthManager);
            this.vaultContext = new VaultContext(this);
            this.safetyLayer = new SafetyLayer(this);

            this.calendarTools = new CalendarTools({
                plugin: this,
                calendarApi: this.googleCalendarApi,
                vaultContext: this.vaultContext,
                safetyLayer: this.safetyLayer
            });
            this.geminiAgent = new GeminiAgent(this, this.calendarTools);

            this.addSettingTab(new SettingsTab(this.app, this));

            this.registerView(VIEW_TYPE_CALENDAR_AGENT, (leaf) => {
                return new CalendarView(leaf, this);
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
                        console.log("[obsidian-calendar-agent] OAuth URL:", authUrl);
                    } catch (error) {
                        console.error("[obsidian-calendar-agent] oauth generate url failed", error);
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
                        console.error("[obsidian-calendar-agent] oauth exchange failed", error);
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
                        console.log("[obsidian-calendar-agent] listEvents result:", events);
                    } catch (error) {
                        console.error("[obsidian-calendar-agent] list events test failed", error);
                        new Notice(`List events lỗi: ${(error as Error).message}`);
                    }
                }
            });

            this.addCommand({
                id: "gemini-hardcoded-tool-test",
                name: "Calendar Agent: Test Gemini Function Calling (hardcoded)",
                callback: async () => {
                    try {
                        const hardcodedMessage = "Hãy liệt kê 5 sự kiện sắp tới trong lịch của tôi.";
                        const result = await this.geminiAgent.run(hardcodedMessage);

                        console.log("[obsidian-calendar-agent] Gemini hardcoded test result:", result);
                        new Notice(
                            `Gemini test OK. Tool calls: ${result.toolTrace.length}. Xem console để kiểm tra chi tiết.`
                        );
                    } catch (error) {
                        console.error("[obsidian-calendar-agent] gemini hardcoded test failed", error);
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
                            console.warn("[obsidian-calendar-agent] undo last returned false");
                        }
                    } catch (error) {
                        console.error("[obsidian-calendar-agent] undo command failed", error);
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
                        console.log("[obsidian-calendar-agent] vault context snapshot:", snapshot);
                        new Notice(
                            `Vault context OK. Daily: ${snapshot.dailyNotes.length}, Tasks: ${snapshot.openTasks.length}, Projects: ${snapshot.projects.length}`
                        );
                    } catch (error) {
                        console.error("[obsidian-calendar-agent] vault context test failed", error);
                        new Notice(`Vault context lỗi: ${(error as Error).message}`);
                    }
                }
            });

            // Tự mở sidebar nếu user bật setting này
            if (this.settings.autoOpenSidebarOnStart) {
                await this.activateView();
            }
        } catch (error) {
            console.error("[obsidian-calendar-agent] onload failed", error);
            new Notice("Calendar Agent: Plugin load thất bại. Xem console để biết chi tiết.");
            throw error;
        }
    }

    async onunload(): Promise<void> {
        try {
            await this.app.workspace.detachLeavesOfType(VIEW_TYPE_CALENDAR_AGENT);
        } catch (error) {
            console.error("[obsidian-calendar-agent] onunload failed", error);
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
            console.error("[obsidian-calendar-agent] activateView failed", error);
            new Notice("Calendar Agent: Không mở được sidebar.");
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
            console.error("[obsidian-calendar-agent] load settings failed", error);
            this.settings = { ...DEFAULT_SETTINGS };
        }
    }

    async savePluginSettings(): Promise<void> {
        try {
            const base = (await this.loadData()) ?? {};
            base.settings = this.settings;
            await this.saveData(base);
        } catch (error) {
            console.error("[obsidian-calendar-agent] save settings failed", error);
            new Notice("Calendar Agent: Không lưu được settings.");
        }
    }
}