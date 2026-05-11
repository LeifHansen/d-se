import { PageLayout } from "@/components/dose/PageLayout";

export default function Accessibility() {
  return (
    <PageLayout
      eyebrow="Accessibility"
      title="Accessibility Statement"
      updated="May 1, 2026"
      testId="page-accessibility"
    >
      <p>
        DŌSE Wellness Co. is committed to making dose.com usable by everyone.
        We design and test against the{" "}
        <a
          href="https://www.w3.org/TR/WCAG22/"
          target="_blank"
          rel="noreferrer"
        >
          Web Content Accessibility Guidelines (WCAG) 2.2 Level AA
        </a>
        .
      </p>

      <h2>What we do</h2>
      <ul>
        <li>
          Keyboard navigation: every interactive element on the site is
          reachable and operable using only a keyboard, with a visible focus
          ring.
        </li>
        <li>
          Color contrast: text and meaningful imagery meet at least the 4.5:1
          contrast ratio for normal text and 3:1 for large text.
        </li>
        <li>
          Alt text: product photography and brand imagery include descriptive
          alternative text for screen readers.
        </li>
        <li>
          Forms: every input has a visible label, required fields are clearly
          marked, and validation errors are announced to assistive
          technologies.
        </li>
        <li>
          Modals: our Age Gate and other dialogs trap focus and restore it on
          close.
        </li>
        <li>
          Automated checks: every release runs an automated{" "}
          <a href="https://github.com/dequelabs/axe-core" target="_blank" rel="noreferrer">
            axe-core
          </a>{" "}
          accessibility audit on the home page (which includes our product
          showcases) and every legal/contact route, and fails on any serious
          or critical violation. We will extend this audit to dedicated
          product detail, cart, and checkout pages as those flows ship.
        </li>
      </ul>

      <h2>Known gaps</h2>
      <p>
        Some third-party widgets (payment, chat) are continuously improving
        their accessibility independently. If you encounter a barrier in any
        of those, please let us know and we will work with the vendor.
      </p>

      <h2>Feedback</h2>
      <p>
        If you have trouble using any part of our site, email{" "}
        <a href="mailto:accessibility@dose.com">accessibility@dose.com</a> or
        use the form on our <a href="/contact">Contact</a> page. We will respond
        within 5 business days and work with you to find an alternative.
      </p>
    </PageLayout>
  );
}
