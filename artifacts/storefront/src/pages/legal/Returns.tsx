import { PageLayout } from "@/components/dose/PageLayout";

export default function Returns() {
  return (
    <PageLayout
      eyebrow="Support"
      title="Returns &amp; Refunds"
      updated="May 1, 2026"
      testId="page-returns"
    >
      <p>
        We stand behind our products. If you're not satisfied, here's how
        returns work.
      </p>

      <h2>30-day satisfaction guarantee</h2>
      <p>
        You may return any DŌSE product within 30 days of delivery for a full
        refund of the product price, even if it has been opened. We'll cover
        return shipping for orders placed in the contiguous U.S.
      </p>

      <h2>How to start a return</h2>
      <ol>
        <li>
          Email <a href="mailto:hello@dose.com">hello@dose.com</a> with your
          order number and a brief reason.
        </li>
        <li>We'll send you a prepaid return label within 1 business day.</li>
        <li>
          Drop the package at any USPS location. Once we receive it, refunds
          are issued within 5 business days to your original payment method.
        </li>
      </ol>

      <h2>Damaged or wrong items</h2>
      <p>
        If a product arrives damaged or you received the wrong item, email us
        within 7 days of delivery with a photo. We will reship at no charge or
        refund in full.
      </p>

      <h2>Non-returnable items</h2>
      <ul>
        <li>Gift cards.</li>
        <li>Items marked "final sale" at checkout.</li>
        <li>Bundles where one component has been used in full.</li>
      </ul>

      <h2>Exchanges</h2>
      <p>
        We don't process direct exchanges. Place a new order for the item you
        want and return the original for a refund.
      </p>
    </PageLayout>
  );
}
