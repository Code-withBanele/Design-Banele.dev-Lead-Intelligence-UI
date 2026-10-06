import assert from "node:assert/strict"

import test from "node:test"

import {
  classifySource,
  deduplicateBusinessRecords,
  extractPaginationTargets,
  extractBusinessCandidates,
  extractBusinessCandidatesDetailed,
  getBusinessIdentity,
} from "./discoveryParsing.js"

function candidate(input: Partial<ReturnType<typeof extractBusinessCandidates>[number]>) {
  return {
    name: "ABC Coffee",
    description: null,
    category: null,
    industry: null,
    address: null,
    location: null,
    phone: null,
    email: null,
    website: null,
    socialUrls: [],
    profileUrl: null,
    sourceUrl: "https://directory.example/places",
    sourcePageUrl: "https://directory.example/places",
    discoveredAt: "2026-10-06T00:00:00.000Z",
    ...input,
  }
}

test("classifies one LocalBusiness page as a business website", () => {
  const result = classifySource({
    url: "https://coffee.example/",
    html: '<script type="application/ld+json">{"@type":"LocalBusiness","name":"ABC Coffee","url":"https://coffee.example"}</script>',
  })

  assert.equal(result.sourceType, "BUSINESS_WEBSITE")
  assert.equal(result.confidence, "HIGH")
})

test("classifies repeated generic listings as a directory", () => {
  const result = classifySource({
    url: "https://directory.example/east-london/restaurants?page=2",
    html: `
      <script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"LocalBusiness","name":"ABC"}},{"@type":"ListItem","item":{"@type":"LocalBusiness","name":"XYZ"}}]}</script>
      <article class="business-card"><h2>ABC Coffee</h2><a href="/business/abc">Profile</a></article>
      <article class="listing-card"><h2>XYZ Studio</h2><a href="/business/xyz">Profile</a></article>
    `,
  })

  assert.equal(result.sourceType, "DIRECTORY")
  assert.equal(result.confidence, "HIGH")
  assert.ok(result.reasons.length >= 2)
})

test("classifies classless repeated name and phone patterns as a directory", () => {
  const html = `
    <h2>ABC Coffee</h2><p>Call +27 12 345 6789</p>
    <h2>XYZ Studio</h2><p>Call +27 21 555 0199</p>
  `
  const result = classifySource({ url: "https://example.org/town", html })

  assert.equal(result.sourceType, "DIRECTORY")
  const candidates = extractBusinessCandidates({ html, sourceUrl: "https://example.org/town" })
  assert.equal(candidates.length, 2)
})

test("repeated business-card containers count as directory signals with opaque profile paths", () => {
  const result = classifySource({
    url: "https://directory.example/region",
    html: '<div class="business-card"><h2>ABC Coffee</h2><a href="/abc">Details</a></div><div class="business-card"><h2>XYZ Studio</h2><a href="/xyz">Details</a></div>',
  })

  assert.equal(result.sourceType, "DIRECTORY")
})

test("classifies an individual directory profile as a listing page", () => {
  const result = classifySource({
    url: "https://directory.example/business/abc-coffee",
    html: '<article><h1>ABC Coffee</h1><a href="tel:+27123456789">Call</a></article>',
  })

  assert.equal(result.sourceType, "LISTING_PAGE")
})

test("listing profile map links do not become business websites", () => {
  const candidates = extractBusinessCandidates({
    sourceUrl: "https://directory.example/business/harbour",
    html: '<html><body><h1>Harbour Cafe</h1><a href="https://maps.google.com/?q=harbour">Map</a><a href="tel:+27123456789">Call</a></body></html>',
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].website, null)
  assert.equal(candidates[0].profileUrl, "https://directory.example/business/harbour")
})

test("LocalBusiness schema on a directory profile does not make the profile page its website", () => {
  const candidates = extractBusinessCandidatesDetailed({
    sourceUrl: "https://directory.example/region",
    sourcePageUrl: "https://directory.example/business/harbour-cafe",
    sourcePageRole: "LISTING_PAGE",
    html: '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Harbour Cafe","url":"https://directory.example/business/harbour-cafe"}</script><h1>Harbour Cafe</h1>',
  }).records

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].website, null)
  assert.equal(candidates[0].profileUrl, "https://directory.example/business/harbour-cafe")
})

test("repeated scans of the same source deduplicate identical business identities", () => {
  const html = '<script type="application/ld+json">{"@type":"LocalBusiness","name":"ABC Coffee","telephone":"+27123456789"}</script>'
  const firstScan = extractBusinessCandidates({ html, sourceUrl: "https://directory.example/list" })
  const secondScan = extractBusinessCandidates({ html, sourceUrl: "https://directory.example/list" })
  const result = deduplicateBusinessRecords([...firstScan, ...secondScan])

  assert.equal(result.records.length, 1)
  assert.equal(result.duplicatesSkipped, 1)
})

test("cross-origin profile links are not retained as listing profiles", () => {
  const candidates = extractBusinessCandidates({
    sourceUrl: "https://directory.example/list",
    html: '<article class="business-card"><h2>ABC Coffee</h2><a href="https://other.example/business/abc">Profile</a></article>',
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].profileUrl, null)
})

test("keeps ambiguous pages UNKNOWN", () => {
  const result = classifySource({ url: "https://example.org/", html: "<html><body><p>Welcome</p></body></html>" })

  assert.equal(result.sourceType, "UNKNOWN")
  assert.equal(result.confidence, "LOW")
})

test("pagination extraction accepts same-origin next pages and rejects cross-origin links", () => {
  const targets = extractPaginationTargets(
    '<nav aria-label="Pagination"><a rel="next" href="?page=2">Next</a><a rel="next" href="https://other.example/page">Next</a></nav>',
    "https://directory.example/businesses?page=1",
  )

  assert.deepEqual(targets, ["https://directory.example/businesses?page=2"])
})

test("extracts separate businesses, retains source provenance, and leaves missing websites unknown", () => {
  const candidates = extractBusinessCandidates({
    sourceUrl: "https://directory.example/cape-town",
    sourcePageUrl: "https://directory.example/cape-town?page=1",
    discoveredAt: "2026-10-06T00:00:00.000Z",
    html: `
      <script type="application/ld+json">[
        {"@type":"LocalBusiness","name":"ABC Coffee","telephone":"+27123456789","address":{"@type":"PostalAddress","streetAddress":"1 Main Rd","addressLocality":"Cape Town"},"url":"https://abc-coffee.example"},
        {"@type":"LocalBusiness","name":"XYZ Studio","telephone":"+27987654321"}
      ]</script>
    `,
  })

  assert.equal(candidates.length, 2)
  assert.equal(candidates[0].sourceUrl, "https://directory.example/cape-town")
  assert.equal(candidates[0].sourcePageUrl, "https://directory.example/cape-town?page=1")
  assert.equal(candidates[0].website, "https://abc-coffee.example/")
  assert.equal(candidates[1].website, null)
  assert.equal(candidates[1].name, "XYZ Studio")
  assert.equal(candidates[0].phone, "+27123456789")
})

test("does not mistake an arbitrary external listing link for a business website", () => {
  const candidates = extractBusinessCandidates({
    sourceUrl: "https://directory.example/places",
    html: '<article class="business-card"><h2>Harbour Cafe</h2><a href="https://maps.google.com/?q=harbour">Map</a><a href="https://directory.example/business/harbour">Profile</a></article>',
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].website, null)
  assert.equal(candidates[0].profileUrl, "https://directory.example/business/harbour")
})

test("deduplicates matching domains, phones, and normalized name-address pairs", () => {
  const result = deduplicateBusinessRecords([
    candidate({ name: "ABC Coffee", website: "https://www.abc.example/" }),
    candidate({ name: "ABC Coffee Cafe", website: "https://abc.example" }),
    candidate({ name: "Different Name", phone: "+27 12 345 6789" }),
    candidate({ name: "Another Name", phone: "27123456789" }),
    candidate({ name: "Cafe Café", address: "1 Main Road, Cape Town" }),
    candidate({ name: "Cafe Cafe", address: "1 Main Road Cape Town" }),
  ])

  assert.equal(result.records.length, 3)
  assert.equal(result.duplicatesSkipped, 3)
})

test("does not merge same-name businesses without corroborating identity", () => {
  const result = deduplicateBusinessRecords([
    candidate({ name: "Central Cafe", sourceUrl: "https://one.example/list" }),
    candidate({ name: "Central Cafe", sourceUrl: "https://two.example/list" }),
  ])

  assert.equal(result.records.length, 2)
  assert.equal(result.duplicatesSkipped, 0)
})

test("same-name branches on one page stay distinct and receive stable rescan identities", () => {
  const html = '<article class="business-card"><h2>Central Cafe</h2><p>Branch A</p></article><article class="business-card"><h2>Central Cafe</h2><p>Branch B</p></article>'
  const sourceUrl = "https://directory.example/central-cafes"
  const first = extractBusinessCandidatesDetailed({ html, sourceUrl, discoveredAt: "2026-10-06T00:00:00Z" }).records
  const second = extractBusinessCandidatesDetailed({ html, sourceUrl, discoveredAt: "2026-10-07T00:00:00Z" }).records

  assert.equal(first.length, 2)
  assert.notEqual(getBusinessIdentity(first[0]).identityKey, getBusinessIdentity(first[1]).identityKey)
  assert.deepEqual(first.map((record) => getBusinessIdentity(record).identityKey), second.map((record) => getBusinessIdentity(record).identityKey))
})
