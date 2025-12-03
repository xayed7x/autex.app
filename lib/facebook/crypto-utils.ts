/**
 * Cryptographic utilities for Facebook OAuth
 * Handles token encryption/decryption and CSRF state token management
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;

// Ensure encryption key is 32 bytes for AES-256
const getEncryptionKey = (): Buffer => {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  
  // If key is shorter than 32 bytes, pad it; if longer, truncate
  const key = Buffer.from(ENCRYPTION_KEY);
  if (key.length < 32) {
    return Buffer.concat([key, Buffer.alloc(32 - key.length)]);
  }
  return key.slice(0, 32);
};

/**
 * Encrypts a Facebook access token using AES-256-GCM
 * @param token - Plaintext access token
 * @returns Encrypted token in format: iv:authTag:encryptedData (all hex-encoded)
 */
export function encryptToken(token: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('❌ Token encryption failed:', error);
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypts a Facebook access token
 * @param encryptedToken - Encrypted token in format: iv:authTag:encryptedData
 * @returns Plaintext access token
 */
export function decryptToken(encryptedToken: string): string {
  try {
    const key = getEncryptionKey();
    const parts = encryptedToken.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format');
    }
    
    const [ivHex, authTagHex, encryptedData] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ Token decryption failed:', error);
    throw new Error('Failed to decrypt token');
  }
}

/**
 * Generates a cryptographically secure CSRF state token
 * @returns Random 32-byte hex string
 */
export function generateStateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a secure random string for various purposes
 * @param length - Number of random bytes (default: 16)
 * @returns Random hex string
 */
export function generateRandomString(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex');
}
