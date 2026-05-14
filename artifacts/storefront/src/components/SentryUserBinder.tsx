import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Sentry, isSentryEnabled } from "@/lib/sentry";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

function SentryUserBinderInner() {
  const { userId, isLoaded } = useAuth();
  useEffect(() => {
    if (!isSentryEnabled() || !isLoaded) return;
    if (userId) Sentry.setUser({ id: userId });
    else Sentry.setUser(null);
  }, [userId, isLoaded]);
  return null;
}

export function SentryUserBinder() {
  if (!clerkPublishableKey) return null;
  return <SentryUserBinderInner />;
}
