import { PageLayout } from "@/components/dose/PageLayout";

export default function Shipping() {
  return (
    <PageLayout
      eyebrow="Support"
      title="Shipping Policy"
      updated="May 1, 2026"
      testId="page-shipping"
    >
      <p>
        We ship Monday through Friday from our facility, excluding U.S.
        federal holidays. Orders placed before 1pm PT typically ship the same
        business day; orders after that ship the next business day.
      </p>

      <h2>Where we ship</h2>
      <p>
        We currently ship to the 48 contiguous United States. We do not yet
        ship to Alaska, Hawaii, U.S. territories, APO/FPO addresses, or
        internationally. We do not ship to states where hemp-derived ∆9-THC
        products are restricted.
      </p>

      <h2>Methods &amp; timelines</h2>
      <ul>
        <li>
          <strong>Standard (3–6 business days)</strong> — flat rate, free over
          $75.
        </li>
        <li>
          <strong>Expedited (2 business days)</strong> — calculated at
          checkout.
        </li>
        <li>
          <strong>Overnight (1 business day)</strong> — calculated at
          checkout, must be ordered before 1pm PT.
        </li>
      </ul>
      <p>
        Tracking is emailed as soon as the carrier scans your package. Delivery
        windows are estimates from the carrier and are not guaranteed.
      </p>

      <h2>Adult signature</h2>
      <p>
        Our products require an adult signature (21+) on delivery. Please use
        a shipping address where someone of legal age can receive the package.
      </p>

      <h2>Lost, stolen, or damaged shipments</h2>
      <p>
        If your tracking shows delivered but your package is missing, please
        wait 48 hours, then email{" "}
        <a href="mailto:hello@dose.com">hello@dose.com</a> with your order
        number. We will work with the carrier to locate it or replace it.
        Damaged shipments must be reported within 7 days of delivery with
        photos.
      </p>

      <h2>Address corrections</h2>
      <p>
        Once a label is created we cannot reroute it. Please double-check
        your address at checkout.
      </p>
    </PageLayout>
  );
}
