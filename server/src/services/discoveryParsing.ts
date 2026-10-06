import { load } from "cheerio"
import type { AnyNode } from "domhandler"

export type DiscoverySourceType = "BUSINESS_WEBSITE" | "DIRECTORY" | "LISTING_PAGE" | "UNKNOWN"
export type DiscoveryConfidence = "HIGH" | "MEDIUM" | "LOW"

export type SourceClassification = {
  sourceType: DiscoverySourceType
  confidence: DiscoveryConfidence
  reasons: string[]
}

export type BusinessCandidate = {
  name: string
  description: string | null
  category: string | null
  industry: string | null
  address: string | null
  location: string | null
  phone: string | null
  email: string | null
  website: string | null
  socialUrls: string[]
  profileUrl: string | null
  sourceUrl: string
  sourcePageUrl: string
  discoveredAt: string
  identityOrdinal?: number
}

export type BusinessIdentity = {
  websiteDomain: string | null
  phone: string | null
  normalizedName: string
  normalizedAddress: string | null
  profileUrl: string | null
  identityKey: string
}

type JsonRecord = Record<string, unknown>

const PROFILE_PATH = /\/(business(?:es)?|company|companies|listing|listings|member|members|profile|profiles|vendor|vendors)\/[^/?#]+/i
const SOCIAL_HOST = /(^|\.)(facebook|instagram|linkedin|youtube|x|twitter|tiktok)\.com$/i

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized ? normalized.slice(0, 1000) : null
}

export function normalizeBusinessName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function normalizeBusinessPhone(value: string | null): string | null {
  const digits = value?.replace(/\D/g, "") ?? ""
  return digits.length >= 7 ? digits : null
}

export function normalizeBusinessDomain(value: string | null): string | null {
  if (!value) return null
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "")
    return hostname || null
  } catch {
    return null
  }
}

export function getBusinessIdentity(candidate: BusinessCandidate): BusinessIdentity {
  const websiteDomain = normalizeBusinessDomain(candidate.website)
  const phone = normalizeBusinessPhone(candidate.phone)
  const normalizedName = normalizeBusinessName(candidate.name)
  const normalizedAddress = candidate.address ? normalizeBusinessName(candidate.address) : null
  const profileUrl = candidate.profileUrl ? normalizeProfileUrl(candidate.profileUrl) : null
  const identityKey = websiteDomain
    ? `domain:${websiteDomain}`
    : phone
      ? `phone:${phone}`
      : normalizedName && normalizedAddress
        ? `name-address:${normalizedName}|${normalizedAddress}`
        : profileUrl
          ? `profile:${profileUrl}`
            : candidate.identityOrdinal !== undefined
              ? `source-page-occurrence:${candidate.sourceUrl}|${candidate.sourcePageUrl}|${normalizedName}|${candidate.identityOrdinal}`
              : `source-unverified:${candidate.sourceUrl}|${candidate.sourcePageUrl}|${normalizedName}|${candidate.discoveredAt}`

  return { websiteDomain, phone, normalizedName, normalizedAddress, profileUrl, identityKey }
}

function normalizeProfileUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ""
    url.search = ""
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    return url.toString().replace(/\/$/, "")
  } catch {
    return value.trim().toLowerCase()
  }
}

export function deduplicateBusinessRecords(candidates: BusinessCandidate[]): {
  records: BusinessCandidate[]
  duplicatesSkipped: number
} {
  const records: BusinessCandidate[] = []
  const domains = new Set<string>()
  const phones = new Set<string>()
  const nameAddresses = new Set<string>()
  const profiles = new Set<string>()

  for (const candidate of candidates) {
    const identity = getBusinessIdentity(candidate)
    const nameAddress = identity.normalizedAddress
      ? `${identity.normalizedName}|${identity.normalizedAddress}`
      : null
    const duplicate = Boolean(
      identity.websiteDomain && domains.has(identity.websiteDomain) ||
      identity.phone && phones.has(identity.phone) ||
      nameAddress && nameAddresses.has(nameAddress) ||
      identity.profileUrl && profiles.has(identity.profileUrl),
    )

    if (duplicate) continue
    records.push(candidate)
    if (identity.websiteDomain) domains.add(identity.websiteDomain)
    if (identity.phone) phones.add(identity.phone)
    if (nameAddress) nameAddresses.add(nameAddress)
    if (identity.profileUrl) profiles.add(identity.profileUrl)
  }

  return { records, duplicatesSkipped: candidates.length - records.length }
}

function jsonLdNodes(html: string): JsonRecord[] {
  const $ = load(html)
  const nodes: JsonRecord[] = []
  $("script[type='application/ld+json']").each((_index, element) => {
    const source = $(element).contents().text().trim()
    try {
      const parsed: unknown = JSON.parse(source)
      const visit = (value: unknown) => {
        if (Array.isArray(value)) {
          value.forEach(visit)
        } else if (value && typeof value === "object") {
          const record = value as JsonRecord
          nodes.push(record)
          Object.values(record).forEach((child) => {
            if (child && typeof child === "object") visit(child)
          })
        }
      }
      visit(parsed)
    } catch {
      // Invalid structured data is ignored; extraction remains deterministic.
    }
  })
  return nodes
}

function schemaTypes(record: JsonRecord): string[] {
  const type = record["@type"]
  if (typeof type === "string") return [type.toLowerCase()]
  if (Array.isArray(type)) return type.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.toLowerCase())
  return []
}

function profileLinks(html: string, sourceUrl: string): string[] {
  const $ = load(html)
  const base = new URL(sourceUrl)
  const links = new Set<string>()
  $("a[href]").each((_index, element) => {
    try {
      const target = new URL($(element).attr("href") ?? "", sourceUrl)
      if (target.protocol !== "http:" && target.protocol !== "https:") return
      if (target.origin === base.origin && PROFILE_PATH.test(target.pathname)) links.add(target.href)
    } catch {
      return
    }
  })
  return [...links]
}

function listingContainers(html: string, sourceUrl: string): number {
  const $ = load(html)
  const sourceOrigin = new URL(sourceUrl).origin
  const selector = "article, [itemtype*='LocalBusiness' i], [class*='business-card' i], [class*='listing-card' i], [class*='company-card' i], [class*='business-listing' i], [class*='search-result' i]"
  const containers = new Set<string>()
  $(selector).each((_index, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim()
    const card = $(element)
    const classNames = (card.attr("class") ?? "").toLowerCase()
    const hasListingClass = /business|listing|company|profile|vendor|search-result/.test(classNames)
    const hasProfileLink = card.find("a[href]").toArray().some((link) => {
      try {
        const target = new URL($(link).attr("href") ?? "", sourceUrl)
        return target.origin === sourceOrigin && PROFILE_PATH.test(target.pathname)
      } catch { return false }
    })
    const hasBusinessMicrodata = card.is("[itemtype*='LocalBusiness' i]")
    const hasContact = Boolean(card.find("address, [itemprop='telephone'], [itemprop='address'], a[href^='tel:'], a[href^='mailto:']").length)
    if (text.length >= 8 && (hasProfileLink || hasBusinessMicrodata || hasContact || hasListingClass && card.find("a[href]").length > 0)) containers.add(text.slice(0, 240))
  })
  return containers.size
}

function isLocalBusiness(record: JsonRecord): boolean {
  return schemaTypes(record).some((type) => type.includes("localbusiness") || type === "organization" || type === "store")
}

export function classifySource(input: { url: string; html: string }): SourceClassification {
  let url: URL
  try {
    url = new URL(input.url)
  } catch {
    return { sourceType: "UNKNOWN", confidence: "LOW", reasons: ["Source URL is invalid"] }
  }

  const nodes = jsonLdNodes(input.html)
  const localBusinessNodes = nodes.filter(isLocalBusiness)
  const itemLists = nodes.filter((node) => schemaTypes(node).includes("itemlist"))
  const repeatedListItems = itemLists.some((node) => Array.isArray(node.itemListElement) && node.itemListElement.length > 1)
  const links = profileLinks(input.html, input.url)
  const cardCount = listingContainers(input.html, input.url)
  const $ = load(input.html)
  const headingNames = new Set($("h2, h3, h4").map((_index, element) => normalizeBusinessName($(element).text())).get().filter(Boolean))
  const phonePatterns = new Set(($.root().text().match(/\+?\d[\d\s().-]{6,}\d/g) ?? []).map((phone) => normalizeBusinessPhone(phone)).filter((phone): phone is string => Boolean(phone)))
  const addressCount = $("address, [itemprop='address'], [class*='address' i]").length
  const queryLooksLikeSearch = [...url.searchParams.keys()].some((key) => /^(page|category|search|filter|location|city|q)$/i.test(key))
  const reasons: string[] = []

  if (repeatedListItems) reasons.push("Multiple structured business/listing items detected")
  if (localBusinessNodes.length > 1) reasons.push("Repeated LocalBusiness or organization structured data found")
  if (links.length > 1) reasons.push("Multiple individual business profile links found")
  if (cardCount > 1) reasons.push("Repeated business/listing cards detected")
  if (headingNames.size > 1) reasons.push("Multiple distinct business headings detected")
  if (phonePatterns.size > 1) reasons.push("Repeated phone number patterns detected")
  if (addressCount > 1) reasons.push("Repeated address signals detected")
  if (queryLooksLikeSearch) reasons.push("Source URL contains listing/search parameters")

  if (repeatedListItems || localBusinessNodes.length > 1 || links.length > 1 || cardCount > 1 || headingNames.size > 1 && (phonePatterns.size > 1 || addressCount > 1) || phonePatterns.size > 1 && addressCount > 1) {
    return { sourceType: "DIRECTORY", confidence: reasons.length > 1 ? "HIGH" : "MEDIUM", reasons }
  }

  const pathSuggestsProfile = PROFILE_PATH.test(url.pathname)
  if (pathSuggestsProfile) {
    return {
      sourceType: "LISTING_PAGE",
      confidence: localBusinessNodes.length || cardCount ? "HIGH" : "MEDIUM",
      reasons: [
        "Source path resembles an individual business profile",
        ...(localBusinessNodes.length ? ["Business structured data found"] : []),
      ],
    }
  }

  if (localBusinessNodes.length === 1) {
    return {
      sourceType: "BUSINESS_WEBSITE",
      confidence: "HIGH",
      reasons: ["One LocalBusiness or organization record found with no repeated listing signals"],
    }
  }

  const title = cleanText($("h1").first().text() || $("title").first().text())
  const hasContactSignal = Boolean($("a[href^='tel:'], a[href^='mailto:']").length)
  if (title && hasContactSignal && !queryLooksLikeSearch) {
    return {
      sourceType: "BUSINESS_WEBSITE",
      confidence: "MEDIUM",
      reasons: ["A single primary page heading and direct contact link were found", ...reasons],
    }
  }

  if (queryLooksLikeSearch) {
    return { sourceType: "UNKNOWN", confidence: "LOW", reasons: [...reasons, "Search-like URL parameters alone are insufficient to classify a directory"] }
  }

  return { sourceType: "UNKNOWN", confidence: "LOW", reasons: ["No reliable business or repeated-listing signals were found"] }
}

export function extractPaginationTargets(html: string, pageUrl: string): string[] {
  const $ = load(html)
  const origin = new URL(pageUrl).origin
  const targets = new Set<string>()
  $("a[href]").each((_index, element) => {
    const anchor = $(element)
    const rel = (anchor.attr("rel") ?? "").toLowerCase()
    const text = (anchor.text() || anchor.attr("aria-label") || "").trim().toLowerCase()
    const paginationContext = anchor.closest("nav, [class*='pagination' i], [aria-label*='pagination' i]").length > 0
    if (!rel.split(/\s+/).includes("next") && !paginationContext && !/^(next|older|›|»|→)$/.test(text)) return
    try {
      const target = new URL(anchor.attr("href") ?? "", pageUrl)
      if (target.protocol === "http:" || target.protocol === "https:") {
        target.hash = ""
        if (target.origin === origin) targets.add(target.href)
      }
    } catch {
      return
    }
  })
  return [...targets]
}

function scalar(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (value && typeof value === "object" && "name" in value) return cleanText((value as JsonRecord).name)
  return null
}

function addressText(value: unknown): string | null {
  if (typeof value === "string") return cleanText(value)
  if (!value || typeof value !== "object") return null
  const address = value as JsonRecord
  return [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode, address.addressCountry]
    .map(scalar)
    .filter((entry): entry is string => Boolean(entry))
    .join(", ") || null
}

function candidateFromRecord(record: JsonRecord, sourceUrl: string, sourcePageUrl: string, discoveredAt: string): BusinessCandidate | null {
  const name = scalar(record.name)
  if (!name || name.length < 2) return null
  const links = [record.url, record.sameAs].flatMap((entry) => Array.isArray(entry) ? entry : [entry]).map(scalar).filter((entry): entry is string => Boolean(entry))
  const socialUrls = links.filter((link) => {
    try { return SOCIAL_HOST.test(new URL(link).hostname) } catch { return false }
  })
  const declaredWebsite = scalar(record.url)
  const website = declaredWebsite && (() => {
    try {
      const target = new URL(declaredWebsite)
      const source = new URL(sourceUrl)
      return (target.protocol === "http:" || target.protocol === "https:") && target.origin !== source.origin && !SOCIAL_HOST.test(target.hostname)
        ? target.href
        : null
    } catch { return null }
  })() || null
  const address = addressText(record.address)
  return {
    name,
    description: scalar(record.description),
    category: scalar(record.category),
    industry: scalar(record.industry),
    address,
    location: addressText(record.address) ? scalar((record.address as JsonRecord)?.addressLocality) : null,
    phone: scalar(record.telephone),
    email: scalar(record.email),
    website,
    socialUrls,
    profileUrl: links.find((link) => {
      try { return new URL(link).origin === new URL(sourceUrl).origin } catch { return false }
    }) ?? null,
    sourceUrl,
    sourcePageUrl,
    discoveredAt,
  }
}

function candidateFromElement($: ReturnType<typeof load>, element: AnyNode, sourceUrl: string, sourcePageUrl: string, discoveredAt: string): BusinessCandidate | null {
  const card = $(element)
  const item = (name: string) => card.find(`[itemprop='${name}']`).first()
  const heading = card.find("h1, h2, h3, h4").first()
  const profileAnchor = card.find("a[href]").filter((_index, link) => {
    try {
      const target = new URL($(link).attr("href") ?? "", sourcePageUrl)
      return target.origin === new URL(sourcePageUrl).origin && PROFILE_PATH.test(target.pathname)
    } catch { return false }
  }).first()
  const name = cleanText(item("name").attr("content") || item("name").text() || heading.text() || profileAnchor.text())
  if (!name || name.length < 2 || name.length > 160) return null

  const links = new Set<string>()
  card.find("a[href]").each((_index, link) => {
    try {
      const href = new URL($(link).attr("href") ?? "", sourcePageUrl)
      if (href.protocol === "http:" || href.protocol === "https:") links.add(href.href)
    } catch { return }
  })
  const socialUrls = [...links].filter((link) => {
    try { return SOCIAL_HOST.test(new URL(link).hostname) } catch { return false }
  })
  const websiteAnchor = card.find("a[itemprop='url'], a[aria-label*='website' i], a[title*='website' i]").first()
  const labeledWebsite = card.find("a[href]").filter((_index, link) => /\b(website|official site|visit (?:our )?(?:site|website))\b/i.test($(link).text() || $(link).attr("aria-label") || $(link).attr("title") || "")).first()
  const explicitWebsiteHref = websiteAnchor.attr("href") ?? labeledWebsite.attr("href")
  const website = explicitWebsiteHref ? (() => {
    try {
      const target = new URL(explicitWebsiteHref, sourcePageUrl)
      return target.origin !== new URL(sourceUrl).origin && !SOCIAL_HOST.test(target.hostname)
        ? target.href
        : null
    } catch { return null }
  })() : null
  const address = item("address").attr("content") || item("address").text() || card.find("address").first().text() || null
  const profileUrl = profileAnchor.attr("href")
  let normalizedProfile: string | null = null
  try { if (profileUrl) normalizedProfile = new URL(profileUrl, sourcePageUrl).href } catch { normalizedProfile = null }
  const phone = item("telephone").attr("content") || item("telephone").text() || card.find("a[href^='tel:']").first().attr("href")?.replace(/^tel:/i, "") || null
  const email = item("email").attr("content") || item("email").text() || card.find("a[href^='mailto:']").first().attr("href")?.replace(/^mailto:/i, "") || null
  const category = item("category").attr("content") || item("category").text() || null

  return {
    name,
    description: cleanText(item("description").attr("content") || item("description").text()),
    category: cleanText(category),
    industry: null,
    address: cleanText(address),
    location: cleanText(item("addressLocality").attr("content") || item("addressLocality").text()),
    phone: cleanText(phone),
    email: cleanText(email),
    website,
    socialUrls,
    profileUrl: normalizedProfile,
    sourceUrl,
    sourcePageUrl,
    discoveredAt,
  }
}

export type ExtractCandidatesInput = {
  html: string
  sourceUrl: string
  sourcePageUrl?: string
  discoveredAt?: string
  sourcePageRole?: "ROOT_SOURCE" | "DIRECTORY_PAGE" | "LISTING_PAGE"
}

export function extractBusinessCandidatesDetailed(input: ExtractCandidatesInput) {
  const sourcePageUrl = input.sourcePageUrl ?? input.sourceUrl
  const discoveredAt = input.discoveredAt ?? new Date().toISOString()
  const candidates: BusinessCandidate[] = []
  const nodes = jsonLdNodes(input.html)
  for (const node of nodes) {
    if (isLocalBusiness(node)) {
      const candidate = candidateFromRecord(node, input.sourceUrl, sourcePageUrl, discoveredAt)
      if (candidate) candidates.push(candidate)
    }
    if (schemaTypes(node).includes("itemlist") && Array.isArray(node.itemListElement)) {
      for (const entry of node.itemListElement) {
        if (!entry || typeof entry !== "object") continue
        const item = (entry as JsonRecord).item
        if (item && typeof item === "object") {
          const candidate = candidateFromRecord(item as JsonRecord, input.sourceUrl, sourcePageUrl, discoveredAt)
          if (candidate) candidates.push(candidate)
        }
      }
    }
  }

  const $ = load(input.html)
  const selectors = "[itemtype*='LocalBusiness' i], article, [class*='business-card' i], [class*='listing-card' i], [class*='company-card' i], [class*='business-listing' i], [class*='search-result' i]"
  $(selectors).each((_index, element) => {
    const candidate = candidateFromElement($, element, input.sourceUrl, sourcePageUrl, discoveredAt)
    if (candidate) candidates.push(candidate)
  })

  if (!candidates.length) {
    $("a[href]").each((_index, element) => {
      let href: URL
      try { href = new URL($(element).attr("href") ?? "", sourcePageUrl) } catch { return }
      if (!PROFILE_PATH.test(href.pathname)) return
      const container = $(element).closest("article, li, [class*='business' i], [class*='listing' i], [class*='result' i]").first()
      if (!container.length) return
      const containerElement = container.get(0)
      if (!containerElement) return
      const candidate = candidateFromElement($, containerElement, input.sourceUrl, sourcePageUrl, discoveredAt)
      if (candidate) candidates.push({ ...candidate, profileUrl: href.href })
    })
  }

  if (!candidates.length) {
    $("h2, h3, h4").each((_index, heading) => {
      const headingNode = $(heading)
      const container = headingNode.closest("article, li, [class*='business' i], [class*='listing' i], [class*='result' i]").first()
      const fallbackContainer = container.length ? container : headingNode.parent().closest("div").first()
      const element = fallbackContainer.get(0)
      if (element) {
        const candidate = candidateFromElement($, element, input.sourceUrl, sourcePageUrl, discoveredAt)
        if (candidate) {
          candidates.push(candidate)
          return
        }
      }

      const name = cleanText(headingNode.text())
      const nearby = headingNode.add(headingNode.nextUntil("h1, h2, h3, h4"))
      const nearbyText = nearby.text().replace(/\s+/g, " ").trim()
      const phone = nearbyText.match(/\+?\d[\d\s().-]{6,}\d/)?.[0] ?? null
      const address = cleanText(nearby.filter("address").text())
      if (!name || (!phone && !address)) return
      const nearbyLinks: string[] = []
      nearby.find("a[href]").each((_linkIndex, link) => {
        try {
          const target = new URL($(link).attr("href") ?? "", sourcePageUrl)
          if (target.protocol === "http:" || target.protocol === "https:") nearbyLinks.push(target.href)
        } catch { return }
      })
      const profileUrl = nearbyLinks.find((link) => {
        try { return new URL(link).origin === new URL(sourcePageUrl).origin && PROFILE_PATH.test(new URL(link).pathname) } catch { return false }
      }) ?? null
      const websiteLink = nearby.find("a[href]").filter((_linkIndex, link) => /\b(website|official site|visit (?:our )?(?:site|website))\b/i.test($(link).text() || $(link).attr("aria-label") || "")).first().attr("href")
      let website: string | null = null
      try {
        if (websiteLink) {
          const target = new URL(websiteLink, sourcePageUrl)
          if (target.origin !== new URL(input.sourceUrl).origin && !SOCIAL_HOST.test(target.hostname)) website = target.href
        }
      } catch { website = null }
      candidates.push({
        name,
        description: null,
        category: null,
        industry: null,
        address,
        location: null,
        phone,
        email: null,
        website,
        socialUrls: nearbyLinks.filter((link) => {
          try { return SOCIAL_HOST.test(new URL(link).hostname) } catch { return false }
        }),
        profileUrl,
        sourceUrl: input.sourceUrl,
        sourcePageUrl,
        discoveredAt,
      })
    })
  }

  if (!candidates.length) {
    const classification = input.sourcePageRole === "LISTING_PAGE"
      ? { sourceType: "LISTING_PAGE" as const, confidence: "HIGH" as const, reasons: ["Fetched as an individual profile from a directory source"] }
      : classifySource({ url: sourcePageUrl, html: input.html })
    if (classification.sourceType === "BUSINESS_WEBSITE" || classification.sourceType === "LISTING_PAGE") {
      const heading = cleanText($("h1").first().text() || $("title").first().text())
      if (heading) {
        const links: string[] = []
        $("a[href]").each((_index, element) => {
          try {
            const target = new URL($(element).attr("href") ?? "", sourcePageUrl)
            if ((target.protocol === "http:" || target.protocol === "https:") && target.origin !== new URL(input.sourceUrl).origin && !SOCIAL_HOST.test(target.hostname)) links.push(target.href)
          } catch { return }
        })
        const phone = cleanText($("a[href^='tel:']").first().attr("href")?.replace(/^tel:/i, ""))
        const email = cleanText($("a[href^='mailto:']").first().attr("href")?.replace(/^mailto:/i, ""))
        const address = cleanText($("address").first().text())
        const explicitWebsite = $("a[itemprop='url'], a[aria-label*='website' i], a[title*='website' i]")
          .add($("a[href]").filter((_index, element) => /\b(website|official site|visit (?:our )?(?:site|website))\b/i.test($(element).text() || $(element).attr("aria-label") || $(element).attr("title") || "")))
          .first()
          .attr("href")
        let listedWebsite: string | null = null
        try {
          if (explicitWebsite) {
            const target = new URL(explicitWebsite, sourcePageUrl)
            if (target.origin !== new URL(input.sourceUrl).origin && !SOCIAL_HOST.test(target.hostname)) listedWebsite = target.href
          }
        } catch { listedWebsite = null }
        candidates.push({
          name: heading,
          description: cleanText($("meta[name='description']").attr("content")),
          category: null,
          industry: null,
          address,
          location: null,
          phone,
          email,
          website: classification.sourceType === "BUSINESS_WEBSITE" ? sourcePageUrl : listedWebsite,
          socialUrls: [],
          profileUrl: classification.sourceType === "LISTING_PAGE" ? sourcePageUrl : null,
          sourceUrl: input.sourceUrl,
          sourcePageUrl,
          discoveredAt,
        })
      }
    }
  }

  const occurrences = new Map<string, number>()
  const indexedCandidates = candidates.map((candidate) => {
    const normalizedName = normalizeBusinessName(candidate.name)
    const identityOrdinal = occurrences.get(normalizedName) ?? 0
    occurrences.set(normalizedName, identityOrdinal + 1)
    return { ...candidate, identityOrdinal }
  })

  return deduplicateBusinessRecords(indexedCandidates)
}

export function extractBusinessCandidates(input: ExtractCandidatesInput): BusinessCandidate[] {
  return extractBusinessCandidatesDetailed(input).records
}
