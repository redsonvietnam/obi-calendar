import { Notice, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_TIMEZONE } from "./types";
/**
 * Settings UI cho obsidian-calendar-agent.
 * Dùng native Setting API của Obsidian, không phụ thuộc React.
 */
export class SettingsTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "obsidian-calendar-agent settings" });
        new Setting(containerEl)
            .setName("Gemini API key (AI Studio)")
            .setDesc("API key dùng cho model gemini-2.0-flash")
            .addText((text) => text
            .setPlaceholder("AIza...")
            .setValue(this.plugin.settings.geminiApiKey)
            .onChange(async (value) => {
            this.plugin.settings.geminiApiKey = value.trim();
            await this.plugin.savePluginSettings();
        }));
        new Setting(containerEl)
            .setName("Google OAuth Client ID")
            .setDesc("OAuth client ID cho Google Calendar API (PKCE)")
            .addText((text) => text
            .setPlaceholder("xxxx.apps.googleusercontent.com")
            .setValue(this.plugin.settings.googleClientId)
            .onChange(async (value) => {
            this.plugin.settings.googleClientId = value.trim();
            await this.plugin.savePluginSettings();
        }));
        new Setting(containerEl)
            .setName("Timezone")
            .setDesc("Timezone mặc định cho thao tác lịch")
            .addText((text) => text
            .setPlaceholder(DEFAULT_TIMEZONE)
            .setValue(this.plugin.settings.timezone)
            .onChange(async (value) => {
            this.plugin.settings.timezone = value.trim() || DEFAULT_TIMEZONE;
            await this.plugin.savePluginSettings();
        }));
        new Setting(containerEl)
            .setName("Auto open sidebar on startup")
            .setDesc("Tự mở chat sidebar khi Obsidian khởi động")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.autoOpenSidebarOnStart).onChange(async (value) => {
            this.plugin.settings.autoOpenSidebarOnStart = value;
            await this.plugin.savePluginSettings();
        }));
        new Setting(containerEl)
            .setName("Safety confirm cho CRUD")
            .setDesc("Bật hộp thoại xác nhận trước khi tạo/sửa/xóa sự kiện")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.requireSafetyConfirm).onChange(async (value) => {
            this.plugin.settings.requireSafetyConfirm = value;
            await this.plugin.savePluginSettings();
        }));
        containerEl.createEl("h3", { text: "OAuth quick actions" });
        new Setting(containerEl)
            .setName("Bước 1: Mở Google OAuth URL")
            .setDesc(`Redirect URI hiện tại: ${this.plugin.oauthManager?.getRedirectUri() ?? "N/A"}`)
            .addButton((btn) => btn.setButtonText("Open auth URL").onClick(async () => {
            try {
                const authUrl = await this.plugin.oauthManager.createAuthorizationUrl();
                window.open(authUrl, "_blank");
                new Notice("Đã mở OAuth URL.");
            }
            catch (error) {
                console.error("[SettingsTab] open auth url failed", error);
                new Notice(`Lỗi OAuth: ${error.message}`);
            }
        }));
        new Setting(containerEl)
            .setName("Bước 2: Exchange code")
            .setDesc("Paste redirect URL hoặc code để lấy access token")
            .addButton((btn) => btn.setButtonText("Exchange").onClick(async () => {
            try {
                const input = window.prompt("Dán redirect URL hoặc authorization code:");
                if (!input?.trim()) {
                    new Notice("Đã hủy exchange.");
                    return;
                }
                const trimmed = input.trim();
                const code = trimmed.startsWith("http")
                    ? this.plugin.oauthManager.extractAuthorizationCodeFromRedirectUrl(trimmed)
                    : trimmed;
                await this.plugin.oauthManager.exchangeCodeForToken(code);
                new Notice("OAuth exchange thành công.");
            }
            catch (error) {
                console.error("[SettingsTab] exchange failed", error);
                new Notice(`Exchange lỗi: ${error.message}`);
            }
        }));
        new Setting(containerEl)
            .setName("Xóa token OAuth")
            .setDesc("Buộc đăng nhập lại Google")
            .addButton((btn) => btn
            .setButtonText("Clear token")
            .setWarning()
            .onClick(async () => {
            try {
                await this.plugin.oauthManager.clearToken();
                new Notice("Đã xóa token OAuth.");
            }
            catch (error) {
                console.error("[SettingsTab] clear token failed", error);
                new Notice(`Clear token lỗi: ${error.message}`);
            }
        }));
    }
}
