import { Notice, Platform, requestUrl } from "obsidian";
import type ObsidianCalendarAgentPlugin from "./main";
import { OAuthTokenData } from "./types";

/**
 * Quản lý OAuth2 PKCE cho Google Calendar.
 * - Không cần file credentials ngoài
 * - Dùng client_id nhập trong settings
 * - Token lưu trong data của plugin
 */
export class OAuthManager {
    private static readonly GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    private static readonly GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static readonly DEFAULT_DESKTOP_REDIRECT_URI = "http://127.0.0.1:53682/oauth2callback";
    private static readonly DEFAULT_MOBILE_REDIRECT_URI = "https://localhost/oauth2callback";
    private static readonly DEFAULT_SCOPES = [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/tasks"
    ];

    private plugin: ObsidianCalendarAgentPlugin;
    private tokenData: OAuthTokenData | null = null;
    private codeVerifier: string | null = null;

    constructor(plugin: ObsidianCalendarAgentPlugin) {
        this.plugin = plugin;
    }

    /**
     * Khởi tạo state từ settings/data đã lưu.
     * Gọi 1 lần khi plugin khởi động.
     */
    async initialize(): Promise<void> {
        try {
            const raw = await this.plugin.loadData();
            const stored = raw?.oauthTokenData as OAuthTokenData | undefined;
            this.tokenData = stored ?? null;
        } catch (error) {
            console.error("[OAuthManager] initialize failed", error);
            this.tokenData = null;
        }
    }

    async clearToken(): Promise<void> {
        this.tokenData = null;
        await this.persistTokenData();
    }

    /**
     * Trả access token hợp lệ.
     * Nếu gần hết hạn thì refresh tự động.
     */
    async getValidAccessToken(): Promise<string> {
        if (!this.tokenData) {
            throw new Error("Chưa đăng nhập Google. Hãy chạy OAuth trước.");
        }

        const now = Date.now();
        const expiresSoon = now > this.tokenData.expiresAt - 60_000;

        if (expiresSoon) {
            await this.refreshAccessToken();
        }

        if (!this.tokenData?.accessToken) {
            throw new Error("Không lấy được access token hợp lệ.");
        }

        return this.tokenData.accessToken;
    }

    /**
     * Bước 1 PKCE: tạo authorize URL để user mở trên trình duyệt.
     */
    async createAuthorizationUrl(): Promise<string> {
        const clientId = this.plugin.settings.googleClientId?.trim();
        if (!clientId) {
            throw new Error("Thiếu Google Client ID trong plugin settings.");
        }

        const redirectUri = this.getRedirectUri();
        this.codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);
        const state = this.generateRandomString(24);

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: OAuthManager.DEFAULT_SCOPES.join(" "),
            access_type: "offline",
            include_granted_scopes: "true",
            prompt: "consent",
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            state
        });

        return `${OAuthManager.GOOGLE_AUTH_URL}?${params.toString()}`;
    }

    /**
     * Bước 2 PKCE: đổi authorization code lấy access/refresh token.
     * Authorization code được lấy từ redirect URL sau khi user đăng nhập.
     */
    async exchangeCodeForToken(authorizationCode: string): Promise<OAuthTokenData> {
        const clientId = this.plugin.settings.googleClientId?.trim();
        if (!clientId) {
            throw new Error("Thiếu Google Client ID trong plugin settings.");
        }

        if (!this.codeVerifier) {
            throw new Error("Không có code_verifier trong session OAuth hiện tại.");
        }

        const redirectUri = this.getRedirectUri();

        const clientSecret = this.plugin.settings.googleClientSecret?.trim();

        const body = new URLSearchParams({
            client_id: clientId,
            grant_type: "authorization_code",
            code: authorizationCode,
            redirect_uri: redirectUri,
            code_verifier: this.codeVerifier
        });

        if (clientSecret) {
            body.set("client_secret", clientSecret);
        }

        const response = await requestUrl({
            url: OAuthManager.GOOGLE_TOKEN_URL,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body.toString(),
            throw: false
        });

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`[OAuthManager] exchange token failed: ${response.status} ${response.text}`);
        }

        const json = response.json as {
            access_token: string;
            refresh_token?: string;
            token_type: string;
            scope: string;
            expires_in: number;
        };

        if (!json.access_token || !json.token_type || !json.expires_in) {
            throw new Error("[OAuthManager] Token response thiếu trường bắt buộc.");
        }

        const tokenData: OAuthTokenData = {
            accessToken: json.access_token,
            refreshToken: json.refresh_token,
            tokenType: json.token_type,
            scope: json.scope ?? "",
            expiresAt: Date.now() + json.expires_in * 1000
        };

        this.tokenData = tokenData;
        this.codeVerifier = null;
        await this.persistTokenData();

        new Notice("Google OAuth kết nối thành công.");
        return tokenData;
    }

    /**
     * Dùng refresh_token để gia hạn access_token.
     */
    async refreshAccessToken(): Promise<void> {
        const clientId = this.plugin.settings.googleClientId?.trim();
        if (!clientId) {
            throw new Error("Thiếu Google Client ID trong plugin settings.");
        }

        if (!this.tokenData?.refreshToken) {
            throw new Error("Không có refresh token. Cần đăng nhập lại Google OAuth.");
        }

        const clientSecret = this.plugin.settings.googleClientSecret?.trim();

        const body = new URLSearchParams({
            client_id: clientId,
            grant_type: "refresh_token",
            refresh_token: this.tokenData.refreshToken
        });

        if (clientSecret) {
            body.set("client_secret", clientSecret);
        }

        const response = await requestUrl({
            url: OAuthManager.GOOGLE_TOKEN_URL,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body.toString(),
            throw: false
        });

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`[OAuthManager] refresh token failed: ${response.status} ${response.text}`);
        }

        const json = response.json as {
            access_token: string;
            token_type: string;
            scope?: string;
            expires_in: number;
        };

        if (!json.access_token || !json.token_type || !json.expires_in) {
            throw new Error("[OAuthManager] Refresh response thiếu trường bắt buộc.");
        }

        this.tokenData = {
            ...this.tokenData,
            accessToken: json.access_token,
            tokenType: json.token_type,
            scope: json.scope ?? this.tokenData.scope,
            expiresAt: Date.now() + json.expires_in * 1000
        };

        await this.persistTokenData();
    }

    hasToken(): boolean {
        return !!this.tokenData?.accessToken;
    }

    getRedirectUri(): string {
        /**
         * Ưu tiên redirect URI do user cấu hình trong settings.
         * Tự loại bỏ query/hash để tránh lỗi:
         * "Invalid redirect_uri contains reserved response param state".
         */
        const configured = this.plugin.settings.googleRedirectUri?.trim();
        if (configured) {
            return this.normalizeRedirectUri(configured);
        }

        if (Platform.isDesktop) {
            return OAuthManager.DEFAULT_DESKTOP_REDIRECT_URI;
        }

        return OAuthManager.DEFAULT_MOBILE_REDIRECT_URI;
    }

    private normalizeRedirectUri(input: string): string {
        try {
            const url = new URL(input.trim());
            url.search = "";
            url.hash = "";
            return url.toString();
        } catch {
            // Fallback cho trường hợp user nhập chuỗi không parse được bởi URL API
            return input.trim().split("?")[0].split("#")[0];
        }
    }

    /**
     * Parse redirect URL và lấy `code`.
     * Hữu ích khi user paste URL redirect vào plugin.
     */
    extractAuthorizationCodeFromRedirectUrl(redirectUrl: string): string {
        try {
            const url = new URL(redirectUrl);
            const code = url.searchParams.get("code");
            if (!code) {
                throw new Error("URL không chứa `code`.");
            }
            return code;
        } catch (error) {
            throw new Error(`Redirect URL không hợp lệ: ${(error as Error).message}`);
        }
    }

    private async persistTokenData(): Promise<void> {
        const base = (await this.plugin.loadData()) ?? {};
        base.oauthTokenData = this.tokenData;
        await this.plugin.saveData(base);
    }

    private generateCodeVerifier(length = 96): string {
        const valid = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        let output = "";
        for (let i = 0; i < length; i += 1) {
            output += valid.charAt(Math.floor(Math.random() * valid.length));
        }
        return output;
    }

    private async generateCodeChallenge(verifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return this.base64UrlEncode(new Uint8Array(digest));
    }

    private base64UrlEncode(bytes: Uint8Array): string {
        let binary = "";
        bytes.forEach((b) => {
            binary += String.fromCharCode(b);
        });

        // btoa có sẵn trong môi trường browser (Obsidian renderer)
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    private generateRandomString(length = 32): string {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        for (let i = 0; i < length; i += 1) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}