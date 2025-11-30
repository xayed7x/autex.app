/**
 * Environment Variable Validation
 * Validates all required environment variables at app startup
 * Prevents runtime failures from missing configuration
 */

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'FACEBOOK_APP_SECRET',
  'FACEBOOK_WEBHOOK_VERIFY_TOKEN',
] as const;

/**
 * Validates that all required environment variables are present
 * @throws Error if any required variables are missing
 */
export function validateEnv(): void {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n\n` +
      `Please check your .env.local file and ensure all required variables are set.`
    );
  }
  
  console.log('✅ Environment variables validated successfully');
}

/**
 * Get environment variable with type safety
 * Only works for required variables
 */
export function getEnv(key: typeof requiredEnvVars[number]): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}
