/**
 * Mirrors the Clerk session into Sentry's user context. Only the Clerk user
 * id is sent — no usernames, emails, or other PII.
 *
 * NOTE: This is currently a no-op because the storefront does not yet wrap
 * the React tree in a <ClerkProvider>. Calling useAuth() outside a
 * ClerkProvider triggers an "Invalid hook call" runtime error. When the
 * customer-facing auth flow lands and ClerkProvider is mounted in main.tsx,
 * restore the implementation below:
 *
 *   import { useEffect } from "react";
 *   import { useAuth } from "@clerk/clerk-react";
 *   import { Sentry, isSentryEnabled } from "@/lib/sentry";
 *
 *   export function SentryUserBinder() {
 *     const { userId, isLoaded } = useAuth();
 *     useEffect(() => {
 *       if (!isSentryEnabled() || !isLoaded) return;
 *       if (userId) Sentry.setUser({ id: userId });
 *       else Sentry.setUser(null);
 *     }, [userId, isLoaded]);
 *     return null;
 *   }
 */
export function SentryUserBinder() {
  return null;
}
