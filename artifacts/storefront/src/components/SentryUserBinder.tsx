import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Sentry, isSentryEnabled } from "@/lib/sentry";

/**
 * Mirrors the Clerk session into Sentry's user context. Only the Clerk user
 * id is sent — no usernames, emails, or other PII.
 */
export function SentryUserBinder() {
  const { userId, isLoaded } = useAuth();

  useEffect(() => {
    if (!isSentryEnabled() || !isLoaded) return;
    if (userId) {
      Sentry.setUser({ id: userId });
    } else {
      Sentry.setUser(null);
    }
  }, [userId, isLoaded]);

  return null;
}
