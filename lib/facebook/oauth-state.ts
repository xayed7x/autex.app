/**
 * OAuth State Token Management (Cookie-based)
 * Manages CSRF state tokens for Facebook OAuth flow using HTTP-only cookies
 * This is more reliable than in-memory storage during development
 */

import { cookies } from 'next/headers';

// State token TTL: 10 minutes
const STATE_TTL = 10 * 60 * 1000;

interface StateData {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Creates and stores a new OAuth state token in cookies
 * @param userId - User ID to associate with this state
 * @param stateToken - Pre-generated state token
 * @returns The state token
 */
export async function createState(userId: string, stateToken: string): Promise<string> {
  const now = Date.now();
  
  const stateData: StateData = {
    userId,
    createdAt: now,
    expiresAt: now + STATE_TTL,
  };
  
  const cookieStore = await cookies();
  
  // Store state data in HTTP-only cookie
  cookieStore.set(`oauth_state_${stateToken}`, JSON.stringify(stateData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_TTL / 1000, // Convert to seconds
    path: '/',
  });
  
  console.log('✅ State token stored in cookie:', stateToken.substring(0, 16) + '...');
  
  return stateToken;
}

/**
 * Validates an OAuth state token from cookies
 * @param state - State token to validate
 * @param userId - Expected user ID
 * @returns True if valid, false otherwise
 */
export async function validateState(state: string, userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieData = cookieStore.get(`oauth_state_${state}`);
  
  if (!cookieData) {
    console.warn('⚠️ State token not found in cookies:', state.substring(0, 16) + '...');
    return false;
  }
  
  try {
    const stateData: StateData = JSON.parse(cookieData.value);
    
    // Check if expired
    if (Date.now() > stateData.expiresAt) {
      console.warn('⚠️ State token expired');
      return false;
    }
    
    // Check if user ID matches
    if (stateData.userId !== userId) {
      console.warn('⚠️ State token user ID mismatch');
      return false;
    }
    
    console.log('✅ State token validated successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Error parsing state data:', error);
    return false;
  }
}

/**
 * Deletes a state token after use
 * @param state - State token to delete
 */
export async function deleteState(state: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(`oauth_state_${state}`);
  console.log('🗑️ State token deleted from cookies');
}

/**
 * Gets the current number of stored state tokens (for debugging)
 * Note: This is not practical with cookie-based storage
 */
export async function getStateCount(): Promise<number> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const stateTokens = allCookies.filter(cookie => cookie.name.startsWith('oauth_state_'));
  return stateTokens.length;
}
