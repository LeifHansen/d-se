import EasyPost from "@easypost/api";

type EasyPostClient = InstanceType<typeof EasyPost>;

let _client: EasyPostClient | null = null;

export function getEasyPost(): EasyPostClient {
  if (_client) return _client;
  const key = process.env.EASYPOST_API_KEY;
  if (!key) {
    throw new Error("EASYPOST_API_KEY not configured");
  }
  _client = new EasyPost(key);
  return _client;
}

export function isEasyPostConfigured(): boolean {
  return Boolean(process.env.EASYPOST_API_KEY);
}

export const FROM_ADDRESS = {
  name: process.env.SHIP_FROM_NAME ?? "Store",
  street1: process.env.SHIP_FROM_STREET1 ?? "417 Montgomery St",
  street2: process.env.SHIP_FROM_STREET2 ?? "",
  city: process.env.SHIP_FROM_CITY ?? "San Francisco",
  state: process.env.SHIP_FROM_STATE ?? "CA",
  zip: process.env.SHIP_FROM_ZIP ?? "94104",
  country: process.env.SHIP_FROM_COUNTRY ?? "US",
  phone: process.env.SHIP_FROM_PHONE ?? "5555555555",
};
