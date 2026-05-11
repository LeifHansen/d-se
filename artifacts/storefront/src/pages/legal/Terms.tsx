import { PageLayout } from "@/components/dose/PageLayout";

export default function Terms() {
  return (
    <PageLayout
      eyebrow="Legal"
      title="Terms of Service"
      updated="May 1, 2026"
      testId="page-terms"
    >
      <p>
        <em>
          Draft — these terms are a starting template and must be reviewed by
          legal counsel before publication.
        </em>
      </p>
      <p>
        These Terms govern your use of dose.com and any purchase you make from
        DŌSE Wellness Co. By using the site or placing an order, you agree to
        these Terms.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be at least 21 years old and located in a U.S. state where
        hemp-derived ∆9-THC products are legal. We reserve the right to refuse
        service or cancel an order if we cannot verify eligibility.
      </p>

      <h2>Products &amp; descriptions</h2>
      <p>
        We work hard to describe our products accurately, but colors, package
        designs, and lab values may vary slightly between batches. Statements
        about wellness benefits have not been evaluated by the FDA. Our
        products are not intended to diagnose, treat, cure, or prevent any
        disease.
      </p>

      <h2>Orders, pricing, and payment</h2>
      <p>
        All orders are subject to acceptance and product availability. Prices
        are listed in USD and do not include applicable taxes or shipping. We
        may correct pricing or inventory errors after you place an order; if we
        do, we will notify you and offer a refund.
      </p>

      <h2>Shipping &amp; risk of loss</h2>
      <p>
        See our <a href="/shipping-policy">Shipping Policy</a>. Risk of loss passes to you
        when the carrier marks the package as delivered.
      </p>

      <h2>Returns &amp; refunds</h2>
      <p>
        See our <a href="/returns">Returns &amp; Refunds</a> policy.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The DŌSE name, logo, packaging, photography, and site content are
        owned by DŌSE Wellness Co. or licensed to us. You may not copy or
        republish them without permission.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Don't attempt to disrupt the site, scrape it at scale, reverse-engineer
        our APIs, or impersonate other people. We may suspend accounts that do.
      </p>

      <h2>Disclaimer &amp; limitation of liability</h2>
      <p>
        The site and products are provided "as is." To the fullest extent
        permitted by law, DŌSE's total liability for any claim is limited to
        the amount you paid us in the 12 months before the claim arose.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of [state], without
        regard to conflicts of law principles. Disputes will be resolved in
        the state and federal courts located in [county, state].
      </p>

      <h2>Changes</h2>
      <p>
        We may update these Terms from time to time. Changes take effect when
        posted; if a change is material we will notify you by email or banner.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email{" "}
        <a href="mailto:hello@dose.com">hello@dose.com</a>.
      </p>
    </PageLayout>
  );
}
