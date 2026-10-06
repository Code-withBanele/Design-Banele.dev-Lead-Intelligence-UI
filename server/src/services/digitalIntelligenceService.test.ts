import assert from "node:assert/strict"

import test from "node:test"

import {
  crawlWebsite,
  crawlWebsiteWithResolver,
  DIGITAL_INTELLIGENCE_CONFIG,
  extractEvidenceFromHtml,
  mapEvidenceToAuditInput,
  validateResolvedWebsiteUrl,
  validateWebsiteUrl,
} from "./digitalIntelligenceService.js"
import { DIGITAL_AUDIT_FACTOR_KEYS } from "./digitalAuditService.js"

test("website validation blocks localhost and private network URLs", () => {
  assert.throws(() => validateWebsiteUrl("http://localhost:3000"), /blocked|local address/i)
  assert.throws(() => validateWebsiteUrl("http://127.0.0.1:3000"), /blocked|local address/i)
  assert.throws(() => validateWebsiteUrl("http://[::1]:3000"), /blocked|local address/i)
  assert.throws(() => validateWebsiteUrl("http://[::ffff:7f00:1]:3000"), /blocked|local address/i)
  assert.throws(() => validateWebsiteUrl("http://[fd00::1]"), /blocked|local address/i)
  assert.throws(() => validateWebsiteUrl("http://169.254.10.10"), /blocked|local address/i)
  assert.throws(() => validateWebsiteUrl("https://service.internal"), /blocked|local address/i)
  assert.throws(() => validateWebsiteUrl("https://printer.local"), /blocked|local address/i)
  assert.equal(validateWebsiteUrl("https://example.com").toString(), "https://example.com")
  assert.equal(validateWebsiteUrl("https://[2606:4700:4700::1111]").startsWith("https://"), true)
})

test("public hostnames resolving to private addresses are blocked", async () => {
  await assert.rejects(
    () => validateResolvedWebsiteUrl("https://public.example", async () => [{ address: "10.0.0.4" }]),
    /private network/i,
  )
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

test("public redirects are allowed and redirect limits are enforced", async () => {
  const originalFetch = globalThis.fetch
  let redirectCount = 0

  globalThis.fetch = async () => {
    redirectCount += 1
    return redirectCount <= 2
      ? new Response(null, { status: 302, headers: { location: "https://example.com/next" } })
      : new Response("<html><title>Example</title></html>", { status: 200, headers: { "content-type": "text/html" } })
  }

  try {
    const result = await crawlWebsiteWithResolver("https://example.com", async () => [{ address: "93.184.216.34" }])
    assert.equal(result.errors.length, 0)
    assert.equal(result.requestsMade, 5)

    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "https://example.com/next" } })
    const limited = await crawlWebsiteWithResolver("https://example.com", async () => [{ address: "93.184.216.34" }])
    assert.ok(limited.errors.some((error) => /too many redirects/i.test(error)))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("page, redirect, and resource requests share one configured request budget", async () => {
  const originalFetch = globalThis.fetch
  const previousLimit = DIGITAL_INTELLIGENCE_CONFIG.maxRequestsPerRun
  let calls = 0
  DIGITAL_INTELLIGENCE_CONFIG.maxRequestsPerRun = 2
  globalThis.fetch = async () => {
    calls += 1
    return new Response("<html><title>Example</title></html>", { status: 200, headers: { "content-type": "text/html" } })
  }

  try {
    const result = await crawlWebsiteWithResolver("https://example.com", async () => [{ address: "93.184.216.34" }])
    assert.equal(calls, 2)
    assert.equal(result.requestsMade, 2)
    assert.equal(result.complete, false)
    assert.ok(result.warnings.some((warning) => /request limit/i.test(warning)))
  } finally {
    DIGITAL_INTELLIGENCE_CONFIG.maxRequestsPerRun = previousLimit
    globalThis.fetch = originalFetch
  }
})

test("robots.txt and sitemap evidence requires successful resource responses", async () => {
  const originalFetch = globalThis.fetch
  const requested: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    requested.push(url)
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *", { status: 200 })
    if (url.endsWith("/sitemap.xml")) return new Response("missing", { status: 404 })
    return new Response("<html><title>Example</title></html>", { status: 200, headers: { "content-type": "text/html" } })
  }

  try {
    const result = await crawlWebsiteWithResolver("https://example.com", async () => [{ address: "93.184.216.34" }])
    assert.ok(requested.includes("https://example.com/robots.txt"))
    assert.ok(requested.includes("https://example.com/sitemap.xml"))
    assert.equal(result.evidence.find((entry) => entry.key === "robots_txt_available")?.observationStatus, "FOUND")
    assert.equal(result.evidence.find((entry) => entry.key === "sitemap_available")?.observationStatus, "NOT_FOUND")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("non-success resource responses remain UNKNOWN rather than NOT_FOUND", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => String(input).includes("/robots.txt") || String(input).includes("/sitemap.xml")
    ? new Response("blocked", { status: 503 })
    : new Response("<html><title>Example</title></html>", { status: 200, headers: { "content-type": "text/html" } })

  try {
    const result = await crawlWebsiteWithResolver("https://example.com", async () => [{ address: "93.184.216.34" }])
    assert.equal(result.evidence.every((entry) => entry.observationStatus === "UNKNOWN"), true)
    assert.equal(result.complete, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("failed page collection stays partial and does not create negative website evidence", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => String(input).endsWith("/robots.txt") || String(input).endsWith("/sitemap.xml")
    ? new Response("unavailable", { status: 503 })
    : new Response("<html>Unavailable</html>", { status: 503, headers: { "content-type": "text/html" } })

  try {
    const result = await crawlWebsiteWithResolver("https://example.com", async () => [{ address: "93.184.216.34" }])
    assert.equal(result.complete, false)
    assert.equal((mapEvidenceToAuditInput(result.evidence, result.complete).hasWebsite as any).value, null)
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

test("evidence maps into the deterministic audit contract without overclaiming SEO", () => {
  const input = [
    { category: "website", key: "website_reachable", value: true, sourceUrl: "https://example.com", sourceType: "website", confidence: "high", collectedAt: new Date().toISOString() },
    { category: "google_business", key: "google_maps_link", value: "https://maps.google.com/abc", sourceUrl: "https://example.com", sourceType: "google", confidence: "high", collectedAt: new Date().toISOString() },
    { category: "contact", key: "phone_number", value: "+27 12 345 6789", sourceUrl: "https://example.com", sourceType: "website", confidence: "high", collectedAt: new Date().toISOString() },
    { category: "seo", key: "page_title", value: "Example Business", sourceUrl: "https://example.com", sourceType: "website", confidence: "high", collectedAt: new Date().toISOString() },
  ] as any

  const audit = mapEvidenceToAuditInput(input)
  assert.deepEqual(Object.keys(audit).sort(), [...DIGITAL_AUDIT_FACTOR_KEYS].sort())

  assert.equal((audit.hasWebsite as any).value, true)
  assert.equal((audit.hasGoogleBusinessProfile as any).value, true)
  assert.equal((audit.hasContactMethod as any).value, true)
  assert.equal((audit.hasBasicSEO as any).value, null)
  assert.match((audit.hasWebsite as any).evidence, /website_reachable/)
  assert.match((audit.hasBasicSEO as any).evidence, /threshold 2\/4/)

  const completeAudit = mapEvidenceToAuditInput([
    ...input,
    { ...input[3], key: "meta_description" },
  ] as any, true)
  assert.equal((completeAudit.hasBasicSEO as any).value, true)
  assert.equal((completeAudit.hasMobileFriendlyWebsite as any).value, null)
})

test("unknown and failed evidence do not become negative audit factors", () => {
  const audit = mapEvidenceToAuditInput([
    { category: "website", key: "website_reachable", value: true, observationStatus: "FAILED", sourceUrl: "https://example.com", sourceType: "website", confidence: "low", collectedAt: new Date().toISOString() },
    { category: "contact", key: "phone_number", value: null, observationStatus: "UNKNOWN", sourceUrl: null, sourceType: "external", confidence: "low", collectedAt: new Date().toISOString() },
  ] as any)

  assert.equal((audit.hasWebsite as any).value, null)
  assert.equal((audit.hasWebsite as any).status, "UNKNOWN")
  assert.equal((audit.hasContactMethod as any).value, null)
})

test("NOT_FOUND evidence only becomes false after a complete collection", () => {
  const evidence = [
    { category: "website", key: "booking_link", value: false, observationStatus: "NOT_FOUND", sourceUrl: "https://example.com", sourceType: "website", confidence: "high", collectedAt: new Date().toISOString() },
  ] as any

  assert.equal((mapEvidenceToAuditInput(evidence, false).hasOnlineBooking as any).value, null)
  assert.equal((mapEvidenceToAuditInput(evidence, true).hasOnlineBooking as any).value, false)
})
