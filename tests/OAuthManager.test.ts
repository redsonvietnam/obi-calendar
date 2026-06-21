import { OAuthManager } from "../src/OAuthManager";
import { Plugin } from "obsidian";
import { requestUrl } from "obsidian";

// Mock requestUrl
jest.mock("obsidian", () => {
    return {
        Notice: jest.fn(),
        Platform: {
            isDesktop: true
        },
        requestUrl: jest.fn(),
        Plugin: class {
            settings = {
                googleClientId: "test-client-id",
                googleClientSecret: "test-client-secret",
                googleRedirectUri: "http://localhost/callback"
            };
            async loadData() { return {}; }
            async saveData(data: any) { return; }
        }
    };
});

describe("OAuthManager", () => {
    let plugin: Plugin;
    let oauthManager: OAuthManager;

    beforeEach(() => {
        jest.clearAllMocks();
        plugin = new Plugin();
        oauthManager = new OAuthManager(plugin);
    });

    describe("createAuthorizationUrl", () => {
        test("should generate correct auth URL with PKCE", async () => {
            const url = await oauthManager.createAuthorizationUrl();
            
            expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
            expect(url).toContain("client_id=test-client-id");
            expect(url).toContain("response_type=code");
            expect(url).toContain("code_challenge=");
            expect(url).toContain("code_challenge_method=S256");
        const urlObj = new URL(url);
        expect(urlObj.searchParams.get("redirect_uri")).toBe("http://localhost/callback");
        });

        test("should throw error if client ID is missing", async () => {
            delete (plugin.settings as any).googleClientId;
            await expect(oauthManager.createAuthorizationUrl()).rejects.toThrow("Thiếu Google Client ID");
        });
    });

    describe("exchangeCodeForToken", () => {
        test("should exchange code for token successfully", async () => {
            // Set code verifier since it's normally set during createAuthorizationUrl
            await oauthManager.createAuthorizationUrl();

            const mockResponse = {
                status: 200,
                json: {
                    access_token: "access-123",
                    refresh_token: "refresh-456",
                    token_type: "Bearer",
                    scope: "calendar",
                    expires_in: 3600
                }
            };
            (requestUrl as jest.Mock).mockResolvedValue(mockResponse);

            const tokens = await oauthManager.exchangeCodeForToken("auth-code-123");

            expect(tokens.accessToken).toBe("access-123");
            expect(tokens.refreshToken).toBe("refresh-456");
            expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
                url: "https://oauth2.googleapis.com/token",
                method: "POST"
            }));
        });

        test("should throw error on failed response", async () => {
            await oauthManager.createAuthorizationUrl();
            (requestUrl as jest.Mock).mockResolvedValue({
                status: 400,
                text: "Invalid code"
            });

            await expect(oauthManager.exchangeCodeForToken("bad-code")).rejects.toThrow("exchange token failed: 400");
        });
    });

    describe("getValidAccessToken", () => {
        test("should return token if valid and not expired", async () => {
            // Manually set token data
            (oauthManager as any).tokenData = {
                accessToken: "valid-token",
                expiresAt: Date.now() + 1000000
            };

            const token = await oauthManager.getValidAccessToken();
            expect(token).toBe("valid-token");
        });

        test("should refresh token if expired", async () => {
            (oauthManager as any).tokenData = {
                accessToken: "old-token",
                refreshToken: "refresh-token",
                expiresAt: Date.now() - 1000
            };

            const mockRefreshResponse = {
                status: 200,
                json: {
                    access_token: "new-token",
                    token_type: "Bearer",
                    expires_in: 3600
                }
            };
            (requestUrl as jest.Mock).mockResolvedValue(mockRefreshResponse);

            const token = await oauthManager.getValidAccessToken();
            expect(token).toBe("new-token");
            expect(requestUrl).toHaveBeenCalled();
        });

        test("should throw error if no token data", async () => {
            await expect(oauthManager.getValidAccessToken()).rejects.toThrow("Chưa đăng nhập Google");
        });
    });

    describe("utility methods", () => {
        test("extractAuthorizationCodeFromRedirectUrl should extract code", () => {
            const url = "http://localhost/callback?code=abc-123&state=xyz";
            expect(oauthManager.extractAuthorizationCodeFromRedirectUrl(url)).toBe("abc-123");
        });

        test("extractAuthorizationCodeFromRedirectUrl should throw if no code", () => {
            const url = "http://localhost/callback?state=xyz";
            expect(() => oauthManager.extractAuthorizationCodeFromRedirectUrl(url)).toThrow("URL không chứa `code`.");
        });
    });
});
