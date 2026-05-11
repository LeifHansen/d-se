import { PageLayout } from "@/components/dose/PageLayout";
import { openCookiePreferences } from "@/components/dose/CookieBanner";

export default function Privacy() {
  return (
    <PageLayout
      eyebrow="Legal"
      title="Privacy Policy"
      updated="May 1, 2026"
      testId="page-privacy"
    >
      <p>
        <em>
          Draft — this document is a plain-language template and should be
          reviewed by your legal counsel before publication.
        </em>
      </p>
      <p>
        DŌSE Wellness Co. ("DŌSE," "we," "us") respects your privacy. This
        policy explains what information we collect when you visit dose.com or
        purchase our products, how we use it, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account &amp; order data:</strong> name, email address,
          shipping and billing address, phone number, order history.
        </li>
        <li>
          <strong>Payment data:</strong> processed by Stripe. We never store
          full card numbers on our servers.
        </li>
        <li>
          <strong>Age verification:</strong> a single yes/no confirmation that
          you are 21+. We do not retain ID images.
        </li>
        <li>
          <strong>Site usage:</strong> pages viewed, referring URLs, device and
          browser type, and aggregated analytics — only after you accept
          analytics cookies.
        </li>
        <li>
          <strong>Communications:</strong> messages you send via our contact
          form, support email, or newsletter sign-up.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To process and ship orders, calculate tax, and prevent fraud.</li>
        <li>To send transactional email (receipts, shipping updates).</li>
        <li>
          To send marketing email when you opt in, and to honor your unsubscribe
          requests promptly.
        </li>
        <li>
          To improve our products, content, and site performance via aggregated
          analytics.
        </li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We share the minimum data necessary with vendors who help us run the
        store: Stripe (payments), EasyPost (shipping labels), Resend (email),
        Clerk (sign-in), and our analytics providers. We do not sell your
        personal information.
      </p>

      <h2>Your choices &amp; rights</h2>
      <ul>
        <li>You can opt out of marketing email at any time via the unsubscribe link.</li>
        <li>
          You can manage analytics cookies any time by opening{" "}
          <button
            type="button"
            onClick={openCookiePreferences}
            className="underline"
            data-testid="link-cookie-prefs"
          >
            Cookie preferences
          </button>
          .
        </li>
        <li>
          California, Colorado, Virginia, and other state residents may request
          a copy or deletion of their personal data by emailing{" "}
          <a href="mailto:privacy@dose.com">privacy@dose.com</a>. We respond
          within 45 days.
        </li>
      </ul>

      <h2>Security &amp; retention</h2>
      <p>
        We use TLS in transit, encryption at rest with our hosting providers,
        and limit employee access to customer data. We retain order records for
        as long as required by tax and consumer-protection laws.
      </p>

      <h2>Children</h2>
      <p>
        Our products are for adults 21 and older. We do not knowingly collect
        information from anyone under 21.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email{" "}
        <a href="mailto:privacy@dose.com">privacy@dose.com</a> or use our{" "}
        <a href="/contact">Contact</a> page.
      </p>
    </PageLayout>
  );
}
