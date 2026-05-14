import { useEffect, useState } from "react";
import { Link } from "wouter";
import { PageLayout } from "@/components/dose/PageLayout";
import { Button } from "@/components/ui/button";
import { unsubscribeNewsletter } from "@workspace/api-client-react";

type Status = "idle" | "loading" | "success" | "error" | "missing";

export default function Unsubscribe() {
  const [status, setStatus] = useState<Status>("idle");
  const [email, setEmail] = useState<string | null>(null);

  function getToken(): string | null {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("token");
  }

  async function run(token: string) {
    setStatus("loading");
    try {
      const result = await unsubscribeNewsletter({ token });
      if (result.ok) {
        setEmail(result.email ?? null);
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus("missing");
      return;
    }
    void run(token);
  }, []);

  return (
    <PageLayout
      eyebrow="Email preferences"
      title="Unsubscribe"
      testId="page-unsubscribe"
    >
      {status === "loading" && (
        <p data-testid="unsubscribe-loading">Updating your preferences…</p>
      )}
      {status === "success" && (
        <div data-testid="unsubscribe-success">
          <p>
            You&apos;ve been unsubscribed
            {email ? (
              <>
                {" "}
                — <strong>{email}</strong> will no longer receive marketing
                email from us.
              </>
            ) : (
              "."
            )}
          </p>
          <p>
            Changed your mind?{" "}
            <Link href="/" className="underline">
              Resubscribe from the homepage
            </Link>
            .
          </p>
        </div>
      )}
      {status === "missing" && (
        <p data-testid="unsubscribe-missing">
          This link is missing its unsubscribe token. Please use the link from
          your email, or contact us if you continue having trouble.
        </p>
      )}
      {status === "error" && (
        <div data-testid="unsubscribe-error">
          <p>
            We couldn&apos;t process that unsubscribe request. The link may be
            invalid or expired.
          </p>
          <Button
            onClick={() => {
              const token = getToken();
              if (token) void run(token);
            }}
          >
            Try again
          </Button>
        </div>
      )}
    </PageLayout>
  );
}
