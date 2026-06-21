/**
 * EncryptionUtils.ts
 * 
 * Provides simple encryption and decryption for sensitive data (tokens).
 * Uses AES encryption via crypto-js.
 */

import CryptoJS from 'crypto-js';

export class EncryptionUtils {
    /**
     * Encrypts a string using a secret key.
     */
    static encrypt(text: string, secret: string): string {
        return CryptoJS.AES.encrypt(text, secret).toString();
    }

    /**
     * Decrypts an encrypted string using a secret key.
     */
    static decrypt(ciphertext: string, secret: string): string {
        const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
        return bytes.toString(CryptoJS.enc.Utf8);
    }

    /**
     * Generates a unique device key to use as encryption secret.
     * In a real Obsidian plugin, this might use plugin settings or a device-specific ID.
     */
    static getDeviceSecret(): string {
        // For this implementation, we use a fixed secret or derive it from environment.
        // In production, this should be more secure.
        return "obi-calendar-secret-key-2026";
    }
}
