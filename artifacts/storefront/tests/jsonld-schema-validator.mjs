// Lightweight schema.org validator for the JSON-LD blocks emitted by
// scripts/prerender.mjs.
//
// We don't try to validate the entire schema.org vocabulary here — the
// goal is narrowly to catch the kinds of subtle mistakes that make
// Google's Rich Results test reject a Product or Article block:
//   * missing required fields,
//   * wrong-shaped offers / publisher / author,
//   * non-enum values for ItemAvailability / OfferItemCondition,
//   * non-ISO-8601 datePublished / dateModified,
//   * non-URL @id / url / image entries,
//   * non-numeric `price` strings or missing 3-letter ISO `priceCurrency`.
//
// Returns an array of human-readable error strings. An empty array means
// the block is valid for our purposes.

const SCHEMA_CONTEXT = "https://schema.org";

const ITEM_AVAILABILITY = new Set([
  "https://schema.org/InStock",
  "https://schema.org/OutOfStock",
  "https://schema.org/PreOrder",
  "https://schema.org/PreSale",
  "https://schema.org/BackOrder",
  "https://schema.org/Discontinued",
  "https://schema.org/InStoreOnly",
  "https://schema.org/LimitedAvailability",
  "https://schema.org/OnlineOnly",
  "https://schema.org/SoldOut",
]);

const OFFER_ITEM_CONDITION = new Set([
  "https://schema.org/NewCondition",
  "https://schema.org/UsedCondition",
  "https://schema.org/RefurbishedCondition",
  "https://schema.org/DamagedCondition",
]);

function isString(v) {
  return typeof v === "string" && v.length > 0;
}

function isAbsoluteUrl(v) {
  if (!isString(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoDate(v) {
  if (!isString(v)) return false;
  // schema.org Date / DateTime are ISO 8601. Require at least YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) {
    return false;
  }
  const t = Date.parse(v);
  return Number.isFinite(t);
}

function isPriceString(v) {
  // Google requires `price` to be a number or a string that parses as a
  // number, with no currency symbol. We accept either.
  if (typeof v === "number") return Number.isFinite(v) && v >= 0;
  if (!isString(v)) return false;
  return /^\d+(\.\d+)?$/.test(v);
}

function isCurrencyCode(v) {
  return isString(v) && /^[A-Z]{3}$/.test(v);
}

function checkContext(block, errors) {
  const ctx = block["@context"];
  const ok =
    ctx === SCHEMA_CONTEXT ||
    ctx === "http://schema.org" ||
    (Array.isArray(ctx) && ctx.includes(SCHEMA_CONTEXT));
  if (!ok) {
    errors.push(`@context must be "${SCHEMA_CONTEXT}", got ${JSON.stringify(ctx)}`);
  }
}

function checkImage(value, path, errors) {
  if (value === undefined) return; // image is recommended, not required
  const arr = Array.isArray(value) ? value : [value];
  if (arr.length === 0) {
    errors.push(`${path}: image present but empty`);
    return;
  }
  for (const [i, item] of arr.entries()) {
    if (typeof item === "string") {
      if (!isAbsoluteUrl(item)) {
        errors.push(`${path}.image[${i}] must be an absolute URL, got ${JSON.stringify(item)}`);
      }
    } else if (item && typeof item === "object") {
      if (item["@type"] !== "ImageObject") {
        errors.push(`${path}.image[${i}].@type must be "ImageObject"`);
      }
      if (!isAbsoluteUrl(item.url)) {
        errors.push(`${path}.image[${i}].url must be an absolute URL`);
      }
    } else {
      errors.push(`${path}.image[${i}] must be a URL string or ImageObject`);
    }
  }
}

function validateOffer(offer, errors) {
  const path = "offers";
  if (!offer || typeof offer !== "object") {
    errors.push(`${path} must be an object`);
    return;
  }
  if (offer["@type"] !== "Offer" && offer["@type"] !== "AggregateOffer") {
    errors.push(`${path}.@type must be "Offer" or "AggregateOffer", got ${JSON.stringify(offer["@type"])}`);
  }
  if (!isPriceString(offer.price)) {
    errors.push(`${path}.price must be a numeric string with no currency symbol, got ${JSON.stringify(offer.price)}`);
  }
  if (!isCurrencyCode(offer.priceCurrency)) {
    errors.push(`${path}.priceCurrency must be a 3-letter ISO 4217 code (uppercase), got ${JSON.stringify(offer.priceCurrency)}`);
  }
  if (offer.availability !== undefined && !ITEM_AVAILABILITY.has(offer.availability)) {
    errors.push(`${path}.availability must be a schema.org ItemAvailability URL, got ${JSON.stringify(offer.availability)}`);
  }
  if (offer.itemCondition !== undefined && !OFFER_ITEM_CONDITION.has(offer.itemCondition)) {
    errors.push(`${path}.itemCondition must be a schema.org OfferItemCondition URL, got ${JSON.stringify(offer.itemCondition)}`);
  }
  if (offer.url !== undefined && !isAbsoluteUrl(offer.url)) {
    errors.push(`${path}.url must be an absolute URL`);
  }
}

function validateProduct(block) {
  const errors = [];
  checkContext(block, errors);
  if (block["@type"] !== "Product") {
    errors.push(`@type must be "Product", got ${JSON.stringify(block["@type"])}`);
  }
  if (!isString(block.name)) {
    errors.push(`name is required and must be a non-empty string`);
  }
  if (block.url !== undefined && !isAbsoluteUrl(block.url)) {
    errors.push(`url must be an absolute URL`);
  }
  checkImage(block.image, "Product", errors);
  if (block.brand !== undefined) {
    if (!block.brand || typeof block.brand !== "object") {
      errors.push(`brand must be an object`);
    } else {
      if (block.brand["@type"] !== "Brand" && block.brand["@type"] !== "Organization") {
        errors.push(`brand.@type must be "Brand" or "Organization"`);
      }
      if (!isString(block.brand.name)) {
        errors.push(`brand.name is required`);
      }
    }
  }
  if (block.offers === undefined) {
    errors.push(`offers is required for Google rich results on Product`);
  } else {
    validateOffer(block.offers, errors);
  }
  return errors;
}

function validatePersonOrOrg(value, path, errors) {
  if (!value || typeof value !== "object") {
    errors.push(`${path} must be an object`);
    return;
  }
  const t = value["@type"];
  if (t !== "Person" && t !== "Organization") {
    errors.push(`${path}.@type must be "Person" or "Organization", got ${JSON.stringify(t)}`);
  }
  if (!isString(value.name)) {
    errors.push(`${path}.name is required`);
  }
}

function validatePublisher(value, errors) {
  const path = "publisher";
  if (!value || typeof value !== "object") {
    errors.push(`${path} is required and must be an Organization`);
    return;
  }
  if (value["@type"] !== "Organization") {
    errors.push(`${path}.@type must be "Organization"`);
  }
  if (!isString(value.name)) {
    errors.push(`${path}.name is required`);
  }
  if (value.logo === undefined) {
    errors.push(`${path}.logo is required for Article rich results`);
  } else if (typeof value.logo === "string") {
    if (!isAbsoluteUrl(value.logo)) {
      errors.push(`${path}.logo must be an absolute URL`);
    }
  } else if (value.logo && typeof value.logo === "object") {
    if (value.logo["@type"] !== "ImageObject") {
      errors.push(`${path}.logo.@type must be "ImageObject"`);
    }
    if (!isAbsoluteUrl(value.logo.url)) {
      errors.push(`${path}.logo.url must be an absolute URL`);
    }
  } else {
    errors.push(`${path}.logo must be a URL string or ImageObject`);
  }
}

function validateArticle(block) {
  const errors = [];
  checkContext(block, errors);
  const allowedTypes = new Set([
    "Article",
    "NewsArticle",
    "BlogPosting",
  ]);
  if (!allowedTypes.has(block["@type"])) {
    errors.push(`@type must be one of ${[...allowedTypes].join(", ")}, got ${JSON.stringify(block["@type"])}`);
  }
  if (!isString(block.headline)) {
    errors.push(`headline is required and must be a non-empty string`);
  } else if (block.headline.length > 110) {
    // Google's published guidance: headline should be <= 110 chars.
    errors.push(`headline is ${block.headline.length} chars; Google requires <= 110`);
  }
  if (block.url !== undefined && !isAbsoluteUrl(block.url)) {
    errors.push(`url must be an absolute URL`);
  }
  checkImage(block.image, "Article", errors);
  if (block.author === undefined) {
    errors.push(`author is required`);
  } else if (Array.isArray(block.author)) {
    block.author.forEach((a, i) => validatePersonOrOrg(a, `author[${i}]`, errors));
  } else {
    validatePersonOrOrg(block.author, "author", errors);
  }
  validatePublisher(block.publisher, errors);
  if (!isIsoDate(block.datePublished)) {
    errors.push(`datePublished is required and must be ISO 8601, got ${JSON.stringify(block.datePublished)}`);
  }
  if (block.dateModified !== undefined && !isIsoDate(block.dateModified)) {
    errors.push(`dateModified must be ISO 8601, got ${JSON.stringify(block.dateModified)}`);
  }
  if (block.mainEntityOfPage !== undefined) {
    const m = block.mainEntityOfPage;
    if (typeof m === "string") {
      if (!isAbsoluteUrl(m)) {
        errors.push(`mainEntityOfPage must be an absolute URL`);
      }
    } else if (m && typeof m === "object") {
      if (m["@type"] !== "WebPage") {
        errors.push(`mainEntityOfPage.@type must be "WebPage"`);
      }
      if (!isAbsoluteUrl(m["@id"])) {
        errors.push(`mainEntityOfPage.@id must be an absolute URL`);
      }
    } else {
      errors.push(`mainEntityOfPage must be a URL string or WebPage object`);
    }
  }
  return errors;
}

function validateOrganization(block) {
  const errors = [];
  checkContext(block, errors);
  if (block["@type"] !== "Organization") {
    errors.push(`@type must be "Organization"`);
  }
  if (!isString(block.name)) errors.push(`name is required`);
  if (!isAbsoluteUrl(block.url)) errors.push(`url must be an absolute URL`);
  if (block.logo !== undefined) {
    if (typeof block.logo === "string") {
      if (!isAbsoluteUrl(block.logo)) {
        errors.push(`logo must be an absolute URL`);
      }
    } else if (block.logo && typeof block.logo === "object") {
      if (block.logo["@type"] !== "ImageObject") {
        errors.push(`logo.@type must be "ImageObject"`);
      }
      if (!isAbsoluteUrl(block.logo.url)) {
        errors.push(`logo.url must be an absolute URL`);
      }
    } else {
      errors.push(`logo must be a URL string or ImageObject`);
    }
  }
  if (Array.isArray(block.sameAs)) {
    block.sameAs.forEach((s, i) => {
      if (!isAbsoluteUrl(s)) {
        errors.push(`sameAs[${i}] must be an absolute URL`);
      }
    });
  }
  return errors;
}

function validateWebSite(block) {
  const errors = [];
  checkContext(block, errors);
  if (block["@type"] !== "WebSite") {
    errors.push(`@type must be "WebSite"`);
  }
  if (!isString(block.name)) errors.push(`name is required`);
  if (!isAbsoluteUrl(block.url)) errors.push(`url must be an absolute URL`);
  if (block.potentialAction !== undefined) {
    const pa = block.potentialAction;
    if (!pa || typeof pa !== "object") {
      errors.push(`potentialAction must be an object`);
    } else {
      if (pa["@type"] !== "SearchAction") {
        errors.push(`potentialAction.@type must be "SearchAction"`);
      }
      if (!isString(pa.target) && !(pa.target && typeof pa.target === "object")) {
        errors.push(`potentialAction.target is required`);
      }
      if (!isString(pa["query-input"])) {
        errors.push(`potentialAction["query-input"] is required`);
      }
    }
  }
  return errors;
}

export function validateJsonLdBlock(block) {
  if (!block || typeof block !== "object") {
    return [`block must be a JSON object`];
  }
  switch (block["@type"]) {
    case "Product":
      return validateProduct(block);
    case "Article":
    case "NewsArticle":
    case "BlogPosting":
      return validateArticle(block);
    case "Organization":
      return validateOrganization(block);
    case "WebSite":
      return validateWebSite(block);
    default:
      // Unknown @type: at minimum require a schema.org @context so
      // crawlers don't choke. Extend this switch as new types are added.
      const errors = [];
      checkContext(block, errors);
      if (!isString(block["@type"])) {
        errors.push(`@type is required`);
      }
      return errors;
  }
}

export function validateJsonLdBlocks(blocks) {
  const allErrors = [];
  blocks.forEach((block, i) => {
    const errs = validateJsonLdBlock(block);
    for (const e of errs) {
      allErrors.push(`block[${i}] (@type=${JSON.stringify(block?.["@type"])}): ${e}`);
    }
  });
  return allErrors;
}
