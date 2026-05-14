import { describe, expect, it } from "vitest";
import { buildTrackingUrl } from "../lib/email";

describe("buildTrackingUrl", () => {
  it("returns a USPS tracking URL for USPS carriers", () => {
    expect(buildTrackingUrl("USPS", "9400111899223197428490")).toBe(
      "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490",
    );
    expect(buildTrackingUrl("usps", "ABC123")).toBe(
      "https://tools.usps.com/go/TrackConfirmAction?tLabels=ABC123",
    );
  });

  it("returns a UPS tracking URL for UPS carriers", () => {
    expect(buildTrackingUrl("UPS", "1Z999AA10123456784")).toBe(
      "https://www.ups.com/track?tracknum=1Z999AA10123456784",
    );
  });

  it("returns a FedEx tracking URL for FedEx carriers", () => {
    expect(buildTrackingUrl("FedEx", "123456789012")).toBe(
      "https://www.fedex.com/fedextrack/?trknbr=123456789012",
    );
    expect(buildTrackingUrl("FEDEX", "123456789012")).toBe(
      "https://www.fedex.com/fedextrack/?trknbr=123456789012",
    );
  });

  it("returns a DHL tracking URL for DHL carriers", () => {
    expect(buildTrackingUrl("DHL", "1234567890")).toBe(
      "https://www.dhl.com/en/express/tracking.html?AWB=1234567890",
    );
    expect(buildTrackingUrl("DHLExpress", "1234567890")).toBe(
      "https://www.dhl.com/en/express/tracking.html?AWB=1234567890",
    );
  });

  it("URL-encodes the tracking code", () => {
    expect(buildTrackingUrl("USPS", "code with spaces&stuff")).toBe(
      "https://tools.usps.com/go/TrackConfirmAction?tLabels=code%20with%20spaces%26stuff",
    );
  });

  it("returns null for an unknown carrier", () => {
    expect(buildTrackingUrl("PonyExpress", "ABC123")).toBeNull();
    expect(buildTrackingUrl("Mystery Carrier 9000", "ABC123")).toBeNull();
  });

  it("returns null when the carrier is missing", () => {
    expect(buildTrackingUrl(null, "ABC123")).toBeNull();
    expect(buildTrackingUrl(undefined, "ABC123")).toBeNull();
    expect(buildTrackingUrl("", "ABC123")).toBeNull();
  });

  it("returns null when the tracking code is empty", () => {
    expect(buildTrackingUrl("USPS", "")).toBeNull();
  });
});
