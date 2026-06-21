import { EncryptionUtils } from "../src/EncryptionUtils";

describe("EncryptionUtils", () => {
    describe("encrypt/decrypt", () => {
        test("should encrypt and decrypt text correctly", () => {
            const original = "my-secret-token-123";
            const secret = "test-secret-key";
            
            const encrypted = EncryptionUtils.encrypt(original, secret);
            expect(encrypted).not.toBe(original);
            expect(typeof encrypted).toBe("string");
            expect(encrypted.length).toBeGreaterThan(0);
            
            const decrypted = EncryptionUtils.decrypt(encrypted, secret);
            expect(decrypted).toBe(original);
        });

        test("should produce different ciphertext for same input", () => {
            const text = "same text";
            const secret = "key";
            
            const enc1 = EncryptionUtils.encrypt(text, secret);
            const enc2 = EncryptionUtils.encrypt(text, secret);
            
            // Due to random IV, ciphertexts should be different
            expect(enc1).not.toBe(enc2);
            
            // But both should decrypt to same plaintext
            expect(EncryptionUtils.decrypt(enc1, secret)).toBe(text);
            expect(EncryptionUtils.decrypt(enc2, secret)).toBe(text);
        });

        test("should fail to decrypt with wrong secret", () => {
            const encrypted = EncryptionUtils.encrypt("secret text", "correct-key");
            const decrypted = EncryptionUtils.decrypt(encrypted, "wrong-key");
            // With wrong key, decryption returns empty or garbled string
            expect(decrypted).not.toBe("secret text");
        });

        test("should handle empty string", () => {
            const encrypted = EncryptionUtils.encrypt("", "key");
            const decrypted = EncryptionUtils.decrypt(encrypted, "key");
            expect(decrypted).toBe("");
        });

        test("should handle long text", () => {
            const longText = "A".repeat(10000);
            const encrypted = EncryptionUtils.encrypt(longText, "key");
            const decrypted = EncryptionUtils.decrypt(encrypted, "key");
            expect(decrypted).toBe(longText);
        });

        test("should handle special characters", () => {
            const special = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
            const encrypted = EncryptionUtils.encrypt(special, "key");
            const decrypted = EncryptionUtils.decrypt(encrypted, "key");
            expect(decrypted).toBe(special);
        });

        test("should handle unicode characters", () => {
            const unicode = "Xin chào thế giới 🌍";
            const encrypted = EncryptionUtils.encrypt(unicode, "key");
            const decrypted = EncryptionUtils.decrypt(encrypted, "key");
            expect(decrypted).toBe(unicode);
        });
    });

    describe("getDeviceSecret", () => {
        test("should return a non-empty string", () => {
            const secret = EncryptionUtils.getDeviceSecret();
            expect(typeof secret).toBe("string");
            expect(secret.length).toBeGreaterThan(0);
        });

        test("should return consistent value", () => {
            const secret1 = EncryptionUtils.getDeviceSecret();
            const secret2 = EncryptionUtils.getDeviceSecret();
            expect(secret1).toBe(secret2);
        });
    });
});
