import { authConfigured, resolveStudioVaultUserId } from "./verify.server";

/**
 * Relay / image-host vault access for this single-tenant studio.
 * Auth off -> shared studio row via resolveStudioVaultUserId.
 * Auth on -> signed-in user (same as requireUserId).
 *
 * Do not call requireUserId when auth is disabled: that path fail-closes
 * against DATABASE_URL and looks like a missing API key.
 */
export async function requireStudioVaultAccess(bearerToken?: string): Promise<string> {
  return resolveStudioVaultUserId(bearerToken);
}

export function studioVaultUsesSharedRow() {
  return authConfigured !== true;
}
