import {
    App,
    Notice,
    PluginSettingTab,
    Setting
} from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { DEFAULT_TIMEZONE } from "./types";
import { Logger } from "./Logger";

/**
 * Settings UI cho obsidian-calendar-agent.
 * Dùng native Setting API của Obsidian, không phụ thuộc React.
 */
export class SettingsTab extends PluginSettingTab {
    private readonly plugin: ObsidianCalendarAgentPlugin;

    constructor(app: App, plugin: ObsidianCalendarAgentPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "obsidian-calendar-agent settings" });

        new Setting(containerEl)
            .setName("Gemini API key (AI Studio)")
            .setDesc("API key dùng cho model gemini-2.0-flash")
            .addText((text) =>
                text
                    .setPlaceholder("AIza...")
                    .setValue(this.plugin.settings.geminiApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.geminiApiKey = value.trim();
                        await this.plugin.savePluginSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Google OAuth Client ID")
            .setDesc("OAuth client ID cho Google Calendar API (PKCE)")
            .addText((text) =>
                text
                    .setPlaceholder("xxxx.apps.googleusercontent.com")
                    .setValue(this.plugin.settings.googleClientId)
                    .onChange(async (value) => {
                        this.plugin.settings.googleClientId = value.trim();
                        await this.plugin.savePluginSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Google OAuth Client Secret (optional)")
            .setDesc("Cần nhập nếu Google trả lỗi: client_secret is missing")
            .addText((text) =>
                text
                    .setPlaceholder("GOCSPX-...")
                    .setValue(this.plugin.settings.googleClientSecret ?? "")
                    .onChange(async (value) => {
                        this.plugin.settings.googleClientSecret = value.trim();
                        await this.plugin.savePluginSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Google OAuth Redirect URI (optional)")
            .setDesc(
                "Để trống = tự dùng mặc định. Nếu bị redirect_uri_mismatch thì nhập URI đúng như trong Google Cloud."
            )
            .addText((text) =>
                text
                    .setPlaceholder("http://127.0.0.1:53682/oauth2callback")
                    .setValue(this.plugin.settings.googleRedirectUri)
                    .onChange(async (value) => {
                        this.plugin.settings.googleRedirectUri = value.trim();
                        await this.plugin.savePluginSettings();
                        this.display();
                    })
            );

        new Setting(containerEl)
            .setName("Timezone")
            .setDesc("Timezone mặc định cho thao tác lịch")
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_TIMEZONE)
                    .setValue(this.plugin.settings.timezone)
                    .onChange(async (value) => {
                        this.plugin.settings.timezone = value.trim() || DEFAULT_TIMEZONE;
                        await this.plugin.savePluginSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Auto open sidebar on startup")
            .setDesc("Tự mở chat sidebar khi Obsidian khởi động")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoOpenSidebarOnStart).onChange(async (value) => {
                    this.plugin.settings.autoOpenSidebarOnStart = value;
                    await this.plugin.savePluginSettings();
                })
            );

        new Setting(containerEl)
            .setName("Safety confirm cho CRUD")
            .setDesc("Bật hộp thoại xác nhận trước khi tạo/sửa/xóa sự kiện")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.requireSafetyConfirm).onChange(async (value) => {
                    this.plugin.settings.requireSafetyConfirm = value;
                    await this.plugin.savePluginSettings();
                })
            );

        new Setting(containerEl)
            .setName("Calendar refresh interval (seconds)")
            .setDesc("Tự động làm mới lịch sau mỗi X giây (30-300s).")
            .addText((text) =>
                text
                    .setPlaceholder("60")
                    .setValue(String(this.plugin.settings.calendarRefreshInterval))
                    .onChange(async (value) => {
                        const numValue = parseInt(value.trim());
                        if (isNaN(numValue) || numValue < 30 || numValue > 300) {
                            new Notice("Khoảng thời gian làm mới phải là số từ 30 đến 300 giây.");
                            return;
                        }
                        this.plugin.settings.calendarRefreshInterval = numValue;
                        await this.plugin.savePluginSettings();
                    })
            );

        // Add settings for daily notes and project notes folders
        new Setting(containerEl)
            .setName("Daily Notes Folder")
            .setDesc("Folder chứa các Daily Notes của bạn.")
            .addText((text) =>
                text
                    .setPlaceholder("Daily")
                    .setValue(this.plugin.settings.dailyNotesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNotesFolder = value.trim();
                        await this.plugin.savePluginSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Project Notes Folder")
            .setDesc("Folder chứa các Project Notes của bạn.")
            .addText((text) =>
                text
                    .setPlaceholder("Projects")
                    .setValue(this.plugin.settings.projectNotesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.projectNotesFolder = value.trim();
                        await this.plugin.savePluginSettings();
                    })
            );

        // Add setting for Inbox Folder
        new Setting(containerEl)
            .setName("Inbox Folder")
            .setDesc("Folder chứa các ghi chú hỗn loạn cần AI xử lý.")
            .addText((text) =>
                text
                    .setPlaceholder("Inbox")
                    .setValue(this.plugin.settings.inboxFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.inboxFolder = value.trim();
                        await this.plugin.savePluginSettings();
                    })
            );

        containerEl.createEl("h3", { text: "Cấu hình Đồng bộ 2 chiều (Sync)" });

        new Setting(containerEl)
            .setName("Bật Tự động Đồng bộ")
            .setDesc("Tự động đồng bộ các thay đổi từ Google về Obsidian theo chu kỳ")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.sync.enabled)
                    .onChange(async (value) => {
                        this.plugin.settings.sync.enabled = value;
                        await this.plugin.savePluginSettings();
                        this.display(); // Refresh UI to show/hide interval settings
                    })
            );

        if (this.plugin.settings.sync.enabled) {
            new Setting(containerEl)
                .setName("Chu kỳ đồng bộ (phút)")
                .setDesc("Khoảng thời gian giữa các lần tự động đồng bộ (tối thiểu 5 phút)")
                .addText((text) =>
                    text
                        .setPlaceholder("15")
                        .setValue(String(this.plugin.settings.sync.intervalMinutes))
                        .onChange(async (value) => {
                            const numValue = parseInt(value.trim());
                            if (isNaN(numValue) || numValue < 5) {
                                new Notice("Chu kỳ đồng bộ phải là số từ 5 phút trở lên.");
                                return;
                            }
                            this.plugin.settings.sync.intervalMinutes = numValue;
                            await this.plugin.savePluginSettings();
                        })
                );
        }

        new Setting(containerEl)
            .setName("Đồng bộ Google Tasks")
            .setDesc("Cập nhật trạng thái hoàn thành của Task từ Google Tasks về Obsidian")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.sync.syncTasks)
                    .onChange(async (value) => {
                        this.plugin.settings.sync.syncTasks = value;
                        await this.plugin.savePluginSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Đồng bộ Google Calendar")
            .setDesc("Cập nhật các sự kiện từ Google Calendar vào Daily Note (chưa hỗ trợ đầy đủ)")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.sync.syncCalendar)
                    .onChange(async (value) => {
                        this.plugin.settings.sync.syncCalendar = value;
                        await this.plugin.savePluginSettings();
                    })
            );

        containerEl.createEl("h3", { text: "📊 Document Analysis & Learning" });

        new Setting(containerEl)
            .setName("Bật Pattern Learning")
            .setDesc("AI học từ lịch sử phân tích để ước lượng tốt hơn")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.documentAnalysis?.enablePatternLearning ?? true)
                .onChange(async value => {
                    if (!this.plugin.settings.documentAnalysis) {
                        this.plugin.settings.documentAnalysis = { enablePatternLearning: true, showPatternInsights: true };
                    }
                    this.plugin.settings.documentAnalysis.enablePatternLearning = value;
                    await this.plugin.savePluginSettings();
                })
            );

        new Setting(containerEl)
            .setName("Hiển thị Pattern Insights trong Review")
            .setDesc("Hiển thị thống kê lịch sử khi xem xét phân tích mới")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.documentAnalysis?.showPatternInsights ?? true)
                .onChange(async value => {
                    if (!this.plugin.settings.documentAnalysis) {
                        this.plugin.settings.documentAnalysis = { enablePatternLearning: true, showPatternInsights: true };
                    }
                    this.plugin.settings.documentAnalysis.showPatternInsights = value;
                    await this.plugin.savePluginSettings();
                })
            );

        containerEl.createEl("h3", { text: "OAuth quick actions" });

        new Setting(containerEl)
            .setName("Bước 1: Mở Google OAuth URL")
            .setDesc(`Redirect URI hiện tại: ${this.plugin.oauthManager?.getRedirectUri() ?? "N/A"}`)
            .addButton((btn) =>
                btn.setButtonText("Open auth URL").onClick(async () => {
                    try {
                        const authUrl = await this.plugin.oauthManager.createAuthorizationUrl();
                        window.open(authUrl, "_blank");
                        new Notice("Đã mở OAuth URL.");
                    } catch (error) {
                        Logger.error("SettingsTab", "open auth url failed", error);
                        new Notice(`Lỗi OAuth: ${(error as Error).message}`);
                    }
                })
            );

        let exchangeInput = "";

        new Setting(containerEl)
            .setName("Bước 2: Exchange code")
            .setDesc("Dán redirect URL hoặc authorization code vào ô này, rồi bấm Exchange.")
            .addText((text) =>
                text
                    .setPlaceholder("http://127.0.0.1:53682/oauth2callback?... hoặc 4/0Aeo...")
                    .onChange((value) => {
                        exchangeInput = value.trim();
                    })
            )
            .addButton((btn) =>
                btn.setButtonText("Exchange").onClick(async () => {
                    try {
                        const rawInput =
                            exchangeInput ||
                            window.prompt("Dán redirect URL hoặc authorization code:")?.trim() ||
                            "";

                        if (!rawInput) {
                            new Notice("Chưa có dữ liệu để exchange.");
                            return;
                        }

                        const code = rawInput.startsWith("http")
                            ? this.plugin.oauthManager.extractAuthorizationCodeFromRedirectUrl(rawInput)
                            : rawInput;

                        await this.plugin.oauthManager.exchangeCodeForToken(code);
                        new Notice("OAuth exchange thành công.");
                    } catch (error) {
                        Logger.error("SettingsTab", "exchange failed", error);
                        new Notice(`Exchange lỗi: ${(error as Error).message}`);
                    }
                })
            );

        new Setting(containerEl)
            .setName("Xóa token OAuth")
            .setDesc("Buộc đăng nhập lại Google")
            .addButton((btn) =>
                btn
                    .setButtonText("Clear token")
                    .setWarning()
                    .onClick(async () => {
                        try {
                            await this.plugin.oauthManager.clearToken();
                            new Notice("Đã xóa token OAuth.");
                        } catch (error) {
                            Logger.error("SettingsTab", "clear token failed", error);
                            new Notice(`Clear token lỗi: ${(error as Error).message}`);
                        }
                    })
            );
    }
}