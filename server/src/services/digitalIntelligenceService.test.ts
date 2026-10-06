import assert from "node:assert/strict"

import test from "node:test"

import {
  crawlWebsite,
  extractEvidenceFromHtml,
  mapEvidenceToAuditInput,
  validateWebsiteUrl,
} from "./digitalIntelligenceService.js"

test("website validation blocks localhost and private network URLs", () => {
  assert.throws(() => validateWebsiteUrl("http://localhost:3000"), /blocked|local address/i)
  assert.throws(() => validateWebsiteUrl("http://127.0.0.1:3000"), /blocked|local address/i)
  assert.equal(validateWebsiteUrl("https://example.com").toString(), "https://example.com")
})

test("redirect targets must also satisfy the website SSRF policy", async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => ({
    status: 302,
    ok: false,
    headers: new Headers({ location: "http://127.0.0.1:3000/private" }),
    text: async () => "",
  }) as any

  try {
    const result = await crawlWebsite("https://example.com")

    assert.ok(result.errors.some((error) => /blocked|local address/i.test(error)))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("HTML evidence extraction captures contact and SEO signals", () => {
  const html = `
    <html>
      <head>
        <title>Acme Studio</title>
        <meta name="description" content="Design and growth" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href="https://example.com/" />
      </head>
      <body>
        <a href="https://wa.me/27720001122">WhatsApp</a>
        <a href="https://www.google.com/maps?q=Acme">Google Maps</a>
        <a href="https://www.instagram.com/acmestudio">Instagram</a>
        <a href="https://example.com/book-now">Book now</a>
        <p>hello@acmestudio.com</p>
        <p>+27 12 345 6789</p>
      </body>
    </html>
  `

  const evidence = extractEvidenceFromHtml(html, "https://example.com")

  assert.ok(evidence.some((entry) => entry.key === "whatsapp_link"))
  assert.ok(evidence.some((entry) => entry.key === "email_address"))
  assert.ok(evidence.some((entry) => entry.key === "phone_number"))
  assert.ok(evidence.some((entry) => entry.key === "google_maps_link"))
  assert.ok(evidence.some((entry) => entry.key === "social_profile"))
  assert.ok(evidence.some((entry) => entry.key === "cta"))
})

test("evidence maps into the deterministic audit contract", () => {
  const input = [
    { category: "website", key: "website_reachable", value: true, sourceUrl: "https://example.com", sourceType: "website", confidence: "high", collectedAt: new Date().toISOString() },
    { category: "google_business", key: "google_maps_link", value: "https://maps.google.com/abc", sourceUrl: "https://example.com", sourceType: "google", confidence: "high", collectedAt: new Date().toISOString() },
    { category: "contact", key: "phone_number", value: "+27 12 345 6789", sourceUrl: "https://example.com", sourceType: "website", confidence: "high", collectedAt: new Date().toISOString() },
    { category: "seo", key: "page_title", value: "Example Business", sourceUrl: "https://example.com", sourceType: "website", confidence: "high", collectedAt: new Date().toISOString() },
  ] as any

  const audit = mapEvidenceToAuditInput(input)

  assert.equal(audit.hasWebsite, true)
  assert.equal(audit.hasGoogleBusinessProfile, true)
  assert.equal(audit.hasContactMethod, true)
  assert.equal(audit.hasBasicSEO, true)
})
