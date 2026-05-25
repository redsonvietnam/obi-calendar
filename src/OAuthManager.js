import { Notice, Platform } from "obsidian";
/**
 * Quản lý OAuth2 PKCE cho Google Calendar.
 * - Không cần file credentials ngoài
 * - Dùng client_id nhập trong settings
 * - Token lưu trong data của plugin
 */
export class OAuthManager {
    constructor(plugin) {
        this.tokenData = null;
        this.codeVerifier = null;
        this.plugin = plugin;
    }
    /**
     * Khởi tạo state từ settings/data đã lưu.
     * Gọi 1 lần khi plugin khởi động.
     */
    async initialize() {
        try {
            const raw = await this.plugin.loadData();
            const stored = raw?.oauthTokenData;
            this.tokenData = stored ?? null;
        }
        catch (error) {
            console.error("[OAuthManager] initialize failed", error);
            this.tokenData = null;
        }
    }
    async clearToken() {
        this.tokenData = null;
        await this.persistTokenData();
    }
    /**
     * Trả access token hợp lệ.
     * Nếu gần hết hạn thì refresh tự động.
     */
    async getValidAccessToken() {
        if (!this.tokenData) {
            throw new Error("Chưa đăng nhập Google. Hãy chạy OAuth trước.");
        }
        const now = Date.now();
        const expiresSoon = now > this.tokenData.expiresAt - 60000;
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
    async createAuthorizationUrl() {
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
    async exchangeCodeForToken(authorizationCode) {
        const clientId = this.plugin.settings.googleClientId?.trim();
        if (!clientId) {
            throw new Error("Thiếu Google Client ID trong plugin settings.");
        }
        if (!this.codeVerifier) {
            throw new Error("Không có code_verifier trong session OAuth hiện tại.");
        }
        const redirectUri = this.getRedirectUri();
        const body = new URLSearchParams({
            client_id: clientId,
            grant_type: "authorization_code",
            code: authorizationCode,
            redirect_uri: redirectUri,
            code_verifier: this.codeVerifier
        });
        const response = await fetch(OAuthManager.GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body.toString()
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`[OAuthManager] exchange token failed: ${response.status} ${text}`);
        }
        const json = await response.json();
        if (!json.access_token || !json.token_type || !json.expires_in) {
            throw new Error("[OAuthManager] Token response thiếu trường bắt buộc.");
        }
        const tokenData = {
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
    async refreshAccessToken() {
        const clientId = this.plugin.settings.googleClientId?.trim();
        if (!clientId) {
            throw new Error("Thiếu Google Client ID trong plugin settings.");
        }
        if (!this.tokenData?.refreshToken) {
            throw new Error("Không có refresh token. Cần đăng nhập lại Google OAuth.");
        }
        const body = new URLSearchParams({
            client_id: clientId,
            grant_type: "refresh_token",
            refresh_token: this.tokenData.refreshToken
        });
        const response = await fetch(OAuthManager.GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body.toString()
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`[OAuthManager] refresh token failed: ${response.status} ${text}`);
        }
        const json = await response.json();
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
    hasToken() {
        return !!this.tokenData?.accessToken;
    }
    getRedirectUri() {
        /**
         * Desktop app: ưu tiên loopback URI cho PKCE
         * User cần cấu hình redirect URI tương ứng trong Google OAuth client.
         *
         * - Desktop: http://127.0.0.1:53682/oauth2callback
         * - Mobile fallback: https://localhost/oauth2callback (ít dùng)
         */
        if (Platform.isDesktop) {
            return "http://127.0.0.1:53682/oauth2callback";
        }
        return "https://localhost/oauth2callback";
    }
    /**
     * Parse redirect URL và lấy `code`.
     * Hữu ích khi user paste URL redirect vào plugin.
     */
    extractAuthorizationCodeFromRedirectUrl(redirectUrl) {
        try {
            const url = new URL(redirectUrl);
            const code = url.searchParams.get("code");
            if (!code) {
                throw new Error("URL không chứa `code`.");
            }
            return code;
        }
        catch (error) {
            throw new Error(`Redirect URL không hợp lệ: ${error.message}`);
        }
    }
    async persistTokenData() {
        const base = (await this.plugin.loadData()) ?? {};
        base.oauthTokenData = this.tokenData;
        await this.plugin.saveData(base);
    }
    generateCodeVerifier(length = 96) {
        const valid = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
        let output = "";
        for (let i = 0; i < length; i += 1) {
            output += valid.charAt(Math.floor(Math.random() * valid.length));
        }
        return output;
    }
    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return this.base64UrlEncode(new Uint8Array(digest));
    }
    base64UrlEncode(bytes) {
        let binary = "";
        bytes.forEach((b) => {
            binary += String.fromCharCode(b);
        });
        // btoa có sẵn trong môi trường browser (Obsidian renderer)
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }
    generateRandomString(length = 32) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        for (let i = 0; i < length; i += 1) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}
OAuthManager.GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
OAuthManager.GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
OAuthManager.DEFAULT_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar"
];
