import { isIP } from "node:net"
import { lookup } from "node:dns/promises"

import { supabase } from "../db/supabase.js"
import { getLeadById } from "./leadService.js"
import { calculateLeadOpportunityScore } from "./opportunityScoreService.js"
import { upsertLeadAudit } from "./digitalAuditService.js"

export const DIGITAL_INTELLIGENCE_COLLECTOR_VERSION = "v1"
export const BASIC_SEO_SIGNAL_THRESHOLD = 2

export type DigitalIntelligenceStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"

export type DigitalIntelligenceCategory =
  | "website"
  | "contact"
  | "social"
  | "google_business"
  | "booking"
  | "ordering"
  | "seo"
  | "technology"
  | "technical"

export type DigitalEvidenceSourceType = "website" | "google" | "social" | "external"
export type DigitalEvidenceConfidence = "high" | "medium" | "low"
export type DigitalEvidenceObservationStatus = "FOUND" | "NOT_FOUND" | "UNKNOWN" | "FAILED"

export type DigitalEvidence = {
  id?: string
  leadId: string
  runId?: string
  category: DigitalIntelligenceCategory
  key: string
  value: unknown
  sourceUrl?: string | null
  sourceType: DigitalEvidenceSourceType
  confidence: DigitalEvidenceConfidence
  observationStatus?: DigitalEvidenceObservationStatus
  collectedAt: string
  metadata?: Record<string, unknown>
}

export type DigitalIntelligenceRun = {
  id: string
  leadId: string
  status: DigitalIntelligenceStatus
  startedAt: string
  completedAt: string | null
  pagesCrawled: number
  requestsMade: number
  evidenceCount: number
  errorCount: number
  warnings: string[]
  errorMessages: string[]
  collectorVersion: string
  sourceUrl?: string | null
  evidence: DigitalEvidence[]
}

export type DigitalIntelligenceRequest = {
  website?: string
  sourceUrl?: string
}

export type DigitalIntelligenceResult = DigitalIntelligenceRun & {
  audit: Record<string, unknown>
  score: {
    score: number
    classification: "LOW" | "MEDIUM" | "HIGH"
    rulesetVersion: string
    calculatedAt: string
    contributingFactors: string[]
  }
}

export const DIGITAL_INTELLIGENCE_CONFIG = {
  maxPagesPerRun: Number(process.env.MAX_PAGES_PER_RUN ?? 15),
  maxDepth: Number(process.env.MAX_CRAWL_DEPTH ?? 2),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 10000),
  maxRedirects: Number(process.env.MAX_REDIRECTS ?? 5),
  maxResponseSize: Number(process.env.MAX_RESPONSE_SIZE ?? 1200000),
  maxRequestsPerRun: Number(process.env.MAX_REQUESTS_PER_RUN ?? 25),
}

function isPrivateIp(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  const family = isIP(host)

  if (family === 4) {
    const [first, second, third] = host.split(".").map(Number)
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    )
  }

  if (family !== 6) return false

  const expanded = expandIpv6(host)
  if (!expanded) return true

  const groups = expanded.split(":").map((group) => Number.parseInt(group, 16))
  const mappedIpv4Prefix = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  if (mappedIpv4Prefix) {
    const mappedIpv4 = `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
    return isPrivateIp(mappedIpv4)
  }
  const allZeroPrefix = groups.slice(0, 6).every((group) => group === 0)
  if (allZeroPrefix) {
    const mappedIpv4 = `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
    return isPrivateIp(mappedIpv4) || groups[6] === 0 && groups[7] <= 1
  }

  return (groups[0] & 0xfe00) === 0xfc00 || (groups[0] & 0xffc0) === 0xfe80 || (groups[0] & 0xffc0) === 0xfec0
}

function expandIpv6(host: string): string | null {
  if (host.includes("%")) return null
  const halves = host.split("::")
  if (halves.length > 2) return null
  const parseHalf = (half: string) => half ? half.split(":") : []
  const left = parseHalf(halves[0])
  const right = parseHalf(halves[1] ?? "")
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [...left, ...Array(missing).fill("0"), ...right]
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null
  return groups.map((group) => Number.parseInt(group, 16).toString(16).padStart(4, "0")).join(":")
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().trim().replace(/\.$/, "")

  if (!host) return true
  if (host === "localhost" || host.endsWith(".localhost")) return true
  if (host === "localhost.localdomain") return true
  if (host.endsWith(".localdomain") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home.arpa")) return true

  return isPrivateIp(host)
}

export function validateWebsiteUrl(rawUrl: string): string {
  const value = (rawUrl ?? "").trim()

  if (!value) {
    throw new Error("A website URL is required for digital intelligence collection.")
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new Error("The website URL is invalid.")
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported for digital intelligence collection.")
  }

  const hostname = url.hostname.toLowerCase()

  if (isBlockedHostname(hostname)) {
    throw new Error("The website URL resolves to a blocked internal or local address.")
  }

  return url.toString().replace(/\/$/, "")
}

type HostResolver = (hostname: string) => Promise<Array<{ address: string }>>

async function resolveHostname(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true })
}

export async function validateResolvedWebsiteUrl(
  rawUrl: string,
  resolver: HostResolver = resolveHostname,
): Promise<string> {
  const validatedUrl = validateWebsiteUrl(rawUrl)
  const hostname = new URL(validatedUrl).hostname.replace(/^\[|\]$/g, "")

  if (isIP(hostname)) return validatedUrl

  let addresses: Array<{ address: string }>
  try {
    addresses = await resolver(hostname)
  } catch {
    throw new Error("The website hostname could not be safely resolved.")
  }

  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("The website hostname resolves to a blocked local or private network address.")
  }

  return validatedUrl
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  maxRedirects: number,
  requestBudget: { count: number; limit: number },
  resolver: HostResolver,
) {
  let currentUrl = await validateResolvedWebsiteUrl(url, resolver)
  const history: string[] = []

  for (let redirectRound = 0; redirectRound <= maxRedirects; redirectRound += 1) {
    if (requestBudget.count >= requestBudget.limit) {
      throw new Error("The collection request limit was reached.")
    }
    requestBudget.count += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Banele.dev Digital Intelligence Collector/1.0",
        },
      })

      const location = response.headers.get("location")
      const isRedirect = response.status >= 300 && response.status < 400

      if (isRedirect && location) {
        history.push(currentUrl)
        const nextTarget = new URL(location, currentUrl)
        const nextUrl = await validateResolvedWebsiteUrl(nextTarget.toString(), resolver)
        currentUrl = nextUrl
        continue
      }

      let contents = ""
      if (response.body) {
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        let streamEnded = false
        while (size < DIGITAL_INTELLIGENCE_CONFIG.maxResponseSize) {
          const { done, value } = await reader.read()
          if (done) {
            streamEnded = true
            break
          }
          const chunk = value.subarray(0, DIGITAL_INTELLIGENCE_CONFIG.maxResponseSize - size)
          chunks.push(chunk)
          size += chunk.byteLength
          if (chunk.byteLength !== value.byteLength) {
            await reader.cancel()
            streamEnded = true
            break
          }
        }
        if (!streamEnded) await reader.cancel()
        contents = Buffer.concat(chunks).toString("utf8")
      } else {
        contents = (await response.text()).slice(0, DIGITAL_INTELLIGENCE_CONFIG.maxResponseSize)
      }

      return {
        status: response.status,
        ok: response.ok,
        finalUrl: currentUrl,
        history,
        contentType: response.headers.get("content-type") ?? "",
        body: contents.slice(0, DIGITAL_INTELLIGENCE_CONFIG.maxResponseSize),
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out for ${currentUrl}.`)
      }

      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error(`Too many redirects while loading ${url}.`)
}

function extractLinksFromHtml(html: string): string[] {
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi
  const found = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = hrefRegex.exec(html)) !== null) {
    const raw = match[1].trim()
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) {
      continue
    }
    found.add(raw)
  }

  return [...found]
}

function coerceString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const cleaned = value.replace(/\s+/g, " ").trim()
  return cleaned || null
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)
  return matches ? [...new Set(matches.map((entry) => entry.toLowerCase()))] : []
}

function extractPhones(text: string): string[] {
  const matches = text.match(/\+?[0-9()\s.-]{7,}/g)
  if (!matches) return []
  return [...new Set(matches.filter((entry) => /\d/.test(entry)).map((entry) => entry.trim()))]
}

export function extractBusinessName(html: string, sourceUrl: string): string | null {
  const title = coerceString(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1])
  const ogTitle = coerceString(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/is)?.[1])
  const sourceTitle = title ?? ogTitle ?? new URL(sourceUrl).hostname.replace(/\.[a-z]+$/i, "")
  return sourceTitle ? sourceTitle.replace(/[-_]+/g, " ").trim() : null
}

export function detectPageSignals(html: string): {
  title: string | null
  metaDescription: string | null
  canonical: string | null
  viewport: boolean
  hasStructuredData: boolean
  hasGoogleMaps: boolean
} {
  const title = coerceString(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1])
  const metaDescription = coerceString(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/is)?.[1] ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/is)?.[1],
  )
  const canonical = coerceString(
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/is)?.[1],
  )
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html)
  const hasStructuredData = /\{\s*"@context"|\{\s*"@type"|\<script[^>]*type=["']application\/ld\+json["']/is.test(html)
  const hasGoogleMaps = /maps\.google\.|google\.com\/maps|google\.com\/maps\?/i.test(html)

  return {
    title,
    metaDescription,
    canonical,
    viewport,
    hasStructuredData,
    hasGoogleMaps,
  }
}

function normalizeEvidenceValue(value: unknown): unknown {
  if (typeof value === "string") return value.trim()
  return value
}

export function extractEvidenceFromHtml(
  html: string,
  sourceUrl: string,
  category: DigitalIntelligenceCategory = "website",
): DigitalEvidence[] {
  const evidence: DigitalEvidence[] = []
  const lowerHtml = html.toLowerCase()
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  const plainText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const links = extractLinksFromHtml(html)

  if (/wa\.me|whatsapp\.com|api\.whatsapp\.com/i.test(lowerHtml)) {
    for (const link of links) {
      const normalized = link.toLowerCase()
      if (/wa\.me|whatsapp\.com|api\.whatsapp\.com/.test(normalized)) {
        evidence.push({
          leadId: "",
          category: "contact",
          key: "whatsapp_link",
          value: normalizeEvidenceValue(link),
          sourceUrl,
          sourceType: "website",
          confidence: "high",
          collectedAt: new Date().toISOString(),
          metadata: { href: link },
        })
      }
    }
  }

  const emails = extractEmails(plainText)
  for (const email of emails) {
    evidence.push({
      leadId: "",
      category: "contact",
      key: "email_address",
      value: email,
      sourceUrl,
      sourceType: "website",
      confidence: "high",
      collectedAt: new Date().toISOString(),
      metadata: { email },
    })
  }

  const phones = extractPhones(plainText)
  for (const phone of phones.slice(0, 10)) {
    evidence.push({
      leadId: "",
      category: "contact",
      key: "phone_number",
      value: phone,
      sourceUrl,
      sourceType: "website",
      confidence: "high",
      collectedAt: new Date().toISOString(),
      metadata: { phone },
    })
  }

  const socialDomains = [
    "instagram.com",
    "facebook.com",
    "linkedin.com",
    "youtube.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
  ]

  for (const link of links) {
    const linkLower = link.toLowerCase()
    const socialMatch = socialDomains.find((domain) => linkLower.includes(domain))
    if (socialMatch) {
      evidence.push({
        leadId: "",
        category: "social",
        key: "social_profile",
        value: { domain: socialMatch, url: link },
        sourceUrl,
        sourceType: "social",
        confidence: "medium",
        collectedAt: new Date().toISOString(),
        metadata: { domain: socialMatch, href: link },
      })
    }

    if (/maps\.google\.|google\.com\/maps/i.test(linkLower)) {
      evidence.push({
        leadId: "",
        category: "google_business",
        key: "google_maps_link",
        value: link,
        sourceUrl,
        sourceType: "google",
        confidence: "high",
        collectedAt: new Date().toISOString(),
        metadata: { href: link },
      })
    }

    const bookingKeywords = /book|booking|reserve|reservation|appointment|schedule|consultation/i
    if (bookingKeywords.test(link) || bookingKeywords.test(linkLower)) {
      evidence.push({
        leadId: "",
        category: "booking",
        key: "booking_link",
        value: {
          url: link,
          provider: "unknown",
        },
        sourceUrl,
        sourceType: "website",
        confidence: "medium",
        collectedAt: new Date().toISOString(),
        metadata: { href: link },
      })
    }

    const orderingKeywords = /order(?:\s+now)?|shop(?:\s+now)?|buy(?:\s+now)?|checkout|delivery/i
    if (orderingKeywords.test(link) || orderingKeywords.test(linkLower)) {
      evidence.push({
        leadId: "",
        category: "ordering",
        key: "ordering_link",
        value: {
          url: link,
          provider: "unknown",
        },
        sourceUrl,
        sourceType: "website",
        confidence: "medium",
        collectedAt: new Date().toISOString(),
        metadata: { href: link },
      })
    }

    const ctaMatch = /(book now|book|order now|order|shop now|contact us|get a quote|call now|whatsapp us|request a consultation|reserve)/i
    if (ctaMatch.test(link) || ctaMatch.test(linkLower)) {
      evidence.push({
        leadId: "",
        category: "website",
        key: "cta",
        value: {
          text: link,
          href: link,
          type: /book|reserve|appointment|schedule/.test(linkLower) ? "booking" : "cta",
        },
        sourceUrl,
        sourceType: "website",
        confidence: "medium",
        collectedAt: new Date().toISOString(),
        metadata: { href: link },
      })
    }
  }

  const signals = detectPageSignals(html)
  const addSignal = (
    key: string,
    found: boolean,
    value: unknown = true,
    category: DigitalIntelligenceCategory = "seo",
  ) => {
    evidence.push({
      leadId: "",
      category,
      key,
      value: found ? value : null,
      sourceUrl,
      sourceType: "website",
      confidence: found ? "medium" : "high",
      observationStatus: found ? "FOUND" : "NOT_FOUND",
      collectedAt: new Date().toISOString(),
    })
  }

  if (signals.title) {
    evidence.push({
      leadId: "",
      category: "seo",
      key: "page_title",
      value: signals.title,
      sourceUrl,
      sourceType: "website",
      confidence: "high",
      collectedAt: new Date().toISOString(),
      metadata: { title: signals.title },
    })
  } else {
    addSignal("page_title", false)
  }

  if (signals.metaDescription) {
    evidence.push({
      leadId: "",
      category: "seo",
      key: "meta_description",
      value: signals.metaDescription,
      sourceUrl,
      sourceType: "website",
      confidence: "medium",
      collectedAt: new Date().toISOString(),
      metadata: { description: signals.metaDescription },
    })
  } else {
    addSignal("meta_description", false)
  }

  if (signals.canonical) {
    evidence.push({
      leadId: "",
      category: "seo",
      key: "canonical_url",
      value: signals.canonical,
      sourceUrl,
      sourceType: "website",
      confidence: "medium",
      collectedAt: new Date().toISOString(),
      metadata: { canonical: signals.canonical },
    })
  } else {
    addSignal("canonical_url", false)
  }

  if (signals.viewport) {
    evidence.push({
      leadId: "",
      category: "technology",
      key: "viewport_meta_present",
      value: true,
      sourceUrl,
      sourceType: "website",
      confidence: "medium",
      observationStatus: "FOUND",
      collectedAt: new Date().toISOString(),
      metadata: { viewport: true },
    })
  } else {
    addSignal("viewport_meta_present", false, false, "technology")
  }

  if (signals.hasStructuredData) {
    evidence.push({
      leadId: "",
      category: "seo",
      key: "structured_data",
      value: true,
      sourceUrl,
      sourceType: "website",
      confidence: "medium",
      collectedAt: new Date().toISOString(),
      metadata: { structuredData: true },
    })
  } else {
    addSignal("structured_data", false)
  }

  if (extractBusinessName(html, sourceUrl)) {
    evidence.push({
      leadId: "",
      category: "website",
      key: "business_name",
      value: extractBusinessName(html, sourceUrl),
      sourceUrl,
      sourceType: "website",
      confidence: "medium",
      collectedAt: new Date().toISOString(),
      metadata: { businessName: extractBusinessName(html, sourceUrl) },
    })
  } else {
    addSignal("business_name", false, false, "website")
  }

  const observedKeys = [
    ["whatsapp_link", /wa\.me|whatsapp\.com|api\.whatsapp\.com/i.test(lowerHtml), "contact"],
    ["email_address", emails.length > 0, "contact"],
    ["phone_number", phones.length > 0, "contact"],
    ["social_profile", evidence.some((entry) => entry.key === "social_profile"), "social"],
    ["google_maps_link", evidence.some((entry) => entry.key === "google_maps_link"), "google_business"],
    ["booking_link", evidence.some((entry) => entry.key === "booking_link"), "booking"],
    ["ordering_link", evidence.some((entry) => entry.key === "ordering_link"), "ordering"],
    ["cta", evidence.some((entry) => entry.key === "cta"), "website"],
  ] as const

  for (const [key, found, category] of observedKeys) {
    if (!found) addSignal(key, false, false, category)
  }

  const websiteReachableEvidence = {
    leadId: "",
    category: "website" as const,
    key: "website_reachable",
    value: true,
    sourceUrl,
    sourceType: "website" as const,
    confidence: "high" as const,
    collectedAt: new Date().toISOString(),
    metadata: { status: 200 },
  }

  evidence.push(websiteReachableEvidence)

  return evidence
}

export async function crawlWebsite(url: string) {
  return crawlWebsiteWithResolver(url, resolveHostname)
}

export async function crawlWebsiteWithResolver(url: string, resolver: HostResolver) {
  const seededUrl = await validateResolvedWebsiteUrl(url, resolver)
  const pageQueue = [{ url: seededUrl, depth: 0 }]
  const visitedUrls = new Set<string>()
  const pages: Array<{ url: string; status: number; body: string; contentType: string; history: string[] }> = []
  const warnings: string[] = []
  const errors: string[] = []
  let incomplete = false
  const requestBudget = { count: 0, limit: DIGITAL_INTELLIGENCE_CONFIG.maxRequestsPerRun }

  while (pageQueue.length > 0 && pages.length < DIGITAL_INTELLIGENCE_CONFIG.maxPagesPerRun && requestBudget.count < requestBudget.limit) {
    const current = pageQueue.shift()
    if (!current) break
    const normalized = new URL(current.url).toString().replace(/\/$/, "")
    if (visitedUrls.has(normalized)) continue
    visitedUrls.add(normalized)

    try {
      const response = await fetchWithTimeout(
        normalized,
        DIGITAL_INTELLIGENCE_CONFIG.requestTimeoutMs,
        DIGITAL_INTELLIGENCE_CONFIG.maxRedirects,
        requestBudget,
        resolver,
      )

      pages.push({
        url: response.finalUrl,
        status: response.status,
        body: response.body,
        contentType: response.contentType,
        history: response.history,
      })

      if (!response.ok) {
        warnings.push(`Page ${normalized} responded with ${response.status}.`)
        incomplete = true
      }
      if (!response.contentType.toLowerCase().includes("html")) {
        warnings.push(`Page ${normalized} did not return HTML; page evidence remains unknown.`)
        incomplete = true
      }

      if (current.depth >= DIGITAL_INTELLIGENCE_CONFIG.maxDepth) continue

      const links = extractLinksFromHtml(response.body).map((link) => {
        try {
          return new URL(link, response.finalUrl).toString().replace(/\/$/, "")
        } catch {
          return null
        }
      }).filter((entry): entry is string => Boolean(entry))

      for (const link of links) {
        const target = new URL(link)
        const sameOrigin = target.origin === new URL(seededUrl).origin
        if (!sameOrigin) continue
        if (/\.(pdf|zip|exe|png|jpg|jpeg|gif|webp|svg|mp4|mov|avi|mp3|wav|m4a|css|js)(?:\?|#|$)/i.test(target.pathname)) continue
        if (visitedUrls.has(target.toString().replace(/\/$/, ""))) continue
        pageQueue.push({ url: target.toString(), depth: current.depth + 1 })
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown collection error.")
    }
  }

  if (pageQueue.length && requestBudget.count >= requestBudget.limit) {
    warnings.push("The collection request limit was reached before all queued pages were checked.")
    incomplete = true
  }
  if (pageQueue.length && pages.length >= DIGITAL_INTELLIGENCE_CONFIG.maxPagesPerRun) {
    warnings.push("The page limit was reached before all queued pages were checked.")
    incomplete = true
  }

  const resourceEvidence: DigitalEvidence[] = []
  const resourceOrigin = new URL(pages[0]?.url ?? seededUrl).origin
  for (const [path, key] of [["/robots.txt", "robots_txt_available"], ["/sitemap.xml", "sitemap_available"]] as const) {
    const resourceUrl = new URL(path, resourceOrigin).toString()
    if (requestBudget.count >= requestBudget.limit) {
      warnings.push(`Skipped ${path} because the request limit was reached.`)
      incomplete = true
      resourceEvidence.push({
        leadId: "",
        category: "seo",
        key,
        value: null,
        sourceUrl: resourceUrl,
        sourceType: "website",
        confidence: "low",
        observationStatus: "UNKNOWN",
        collectedAt: new Date().toISOString(),
        metadata: { reason: "request_limit" },
      })
      continue
    }

    try {
      const response = await fetchWithTimeout(
        resourceUrl,
        DIGITAL_INTELLIGENCE_CONFIG.requestTimeoutMs,
        DIGITAL_INTELLIGENCE_CONFIG.maxRedirects,
        requestBudget,
        resolver,
      )
      if (response.status === 200) {
        resourceEvidence.push({
          leadId: "",
          category: "seo",
          key,
          value: response.finalUrl,
          sourceUrl: response.finalUrl,
          sourceType: "website",
          confidence: "high",
          observationStatus: "FOUND",
          collectedAt: new Date().toISOString(),
          metadata: { status: response.status },
        })
      } else if (response.status === 404) {
        resourceEvidence.push({
          leadId: "",
          category: "seo",
          key,
          value: false,
          sourceUrl: response.finalUrl,
          sourceType: "website",
          confidence: "high",
          observationStatus: "NOT_FOUND",
          collectedAt: new Date().toISOString(),
          metadata: { status: response.status },
        })
      } else {
        warnings.push(`${path} returned ${response.status}; availability remains unknown.`)
        incomplete = true
        resourceEvidence.push({
          leadId: "",
          category: "seo",
          key,
          value: null,
          sourceUrl: response.finalUrl,
          sourceType: "website",
          confidence: "low",
          observationStatus: "UNKNOWN",
          collectedAt: new Date().toISOString(),
          metadata: { status: response.status },
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to verify ${path}.`
      errors.push(message)
      incomplete = true
      resourceEvidence.push({
        leadId: "",
        category: "seo",
        key,
        value: null,
        sourceUrl: resourceUrl,
        sourceType: "website",
        confidence: "low",
        observationStatus: "FAILED",
        collectedAt: new Date().toISOString(),
      })
    }
  }

  return {
    pages,
    warnings,
    errors,
    requestsMade: requestBudget.count,
    complete: !incomplete && errors.length === 0 && pageQueue.length === 0 && requestBudget.count < requestBudget.limit,
    evidence: resourceEvidence,
  }
}

export function mapEvidenceToAuditInput(
  evidence: DigitalEvidence[],
  collectionComplete = false,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  const stateFor = (key: string): "FOUND" | "NOT_FOUND" | "UNKNOWN" | "FAILED" => {
    const matching = evidence.filter((entry) => entry.key === key)
    if (matching.some((entry) => entry.observationStatus === "FOUND" || entry.observationStatus === undefined && entry.value !== null && entry.value !== false)) return "FOUND"
    if (matching.some((entry) => entry.observationStatus === "FAILED")) return "FAILED"
    if (matching.some((entry) => entry.observationStatus === "NOT_FOUND")) return "NOT_FOUND"
    return "UNKNOWN"
  }
  const found = (...keys: string[]) => keys.some((key) => stateFor(key) === "FOUND")
  const knownAbsent = (...keys: string[]) => collectionComplete && keys.every((key) => stateFor(key) === "NOT_FOUND")
  const detail = (keys: string[], value: boolean | null) => {
    const observed = evidence.find((entry) =>
      keys.includes(entry.key) &&
      (entry.observationStatus === "FOUND" || entry.observationStatus === undefined && entry.value !== null && entry.value !== false),
    )
    const absent = evidence.find((entry) => keys.includes(entry.key) && entry.observationStatus === "NOT_FOUND")
    const failed = evidence.find((entry) => keys.includes(entry.key) && entry.observationStatus === "FAILED")
    const observedState = value === null ? "UNKNOWN" : value ? "FOUND" : "NOT_FOUND"
    const evidenceText = observed
      ? `${observed.key}${observed.sourceUrl ? ` at ${observed.sourceUrl}` : ""}`
      : absent && collectionComplete
        ? `Not found in completed collection${absent.sourceUrl ? ` at ${absent.sourceUrl}` : ""}`
        : failed
          ? "Collection failed; state remains unknown"
          : "No conclusive evidence collected"

    return { value, status: value === null ? "UNKNOWN" : "KNOWN", evidence: `${observedState}: ${evidenceText}` }
  }
  const valueFor = (keys: string[]) => {
    if (found(...keys)) return true
    if (knownAbsent(...keys)) return false
    return null
  }
  const seoSignals = ["page_title", "meta_description", "canonical_url", "structured_data"]
  const foundSeoSignals = seoSignals.filter((key) => stateFor(key) === "FOUND").length
  const allSeoSignalsObserved = collectionComplete && seoSignals.every((key) => stateFor(key) === "FOUND" || stateFor(key) === "NOT_FOUND")

  const website = valueFor(["website_reachable"])
  const googleBusiness = valueFor(["google_maps_link"])
  const activeSocial = valueFor(["social_profile"])
  const whatsapp = valueFor(["whatsapp_link"])
  const contact = found("phone_number", "email_address")
    ? true
    : knownAbsent("phone_number", "email_address")
      ? false
      : null
  const booking = valueFor(["booking_link"])
  const ordering = valueFor(["ordering_link"])
  const cta = valueFor(["cta"])
  const seo = foundSeoSignals >= 2 ? true : allSeoSignalsObserved ? false : null
  const businessInfo = found("business_name", "phone_number", "email_address")
    ? true
    : knownAbsent("business_name", "phone_number", "email_address")
      ? false
      : null
  const mobile = null

  result.hasWebsite = detail(["website_reachable"], website)
  result.hasGoogleBusinessProfile = detail(["google_maps_link"], googleBusiness)
  result.hasActiveSocial = detail(["social_profile"], activeSocial)
  result.hasWhatsApp = detail(["whatsapp_link"], whatsapp)
  result.hasContactMethod = detail(["phone_number", "email_address"], contact)
  result.hasOnlineBooking = detail(["booking_link"], booking)
  result.hasOnlineOrdering = detail(["ordering_link"], ordering)
  result.hasStrongCTA = detail(["cta"], cta)
  result.hasBasicSEO = {
    ...detail(seoSignals, seo),
    evidence: `${seo === null ? "UNKNOWN" : seo ? "FOUND" : "NOT FOUND"}: ${foundSeoSignals}/4 explicit SEO signals; threshold ${BASIC_SEO_SIGNAL_THRESHOLD}/4 (title, description, canonical, structured data).`,
  }
  result.hasVisibleBusinessInformation = detail(["business_name", "phone_number", "email_address"], businessInfo)
  result.hasMobileFriendlyWebsite = {
    ...detail(["viewport_meta_present"], mobile),
    evidence: stateFor("viewport_meta_present") === "FOUND"
      ? "UNKNOWN: viewport meta is present; mobile responsiveness has not been verified"
      : "UNKNOWN: mobile responsiveness has not been verified",
  }

  return result
}

export async function collectDigitalIntelligence(leadId: string, request: DigitalIntelligenceRequest = {}) {
  await getLeadById(leadId)

  const website = request.website ?? request.sourceUrl
  if (!website) {
    const error = new Error("A website URL is required to collect digital intelligence.") as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }

  const validatedUrl = validateWebsiteUrl(website)

  const { data: runData, error: runError } = await supabase
    .from("digital_intelligence_runs")
    .insert({
      lead_id: leadId,
      status: "RUNNING",
      started_at: new Date().toISOString(),
      source_url: validatedUrl,
      collector_version: DIGITAL_INTELLIGENCE_COLLECTOR_VERSION,
    })
    .select()
    .single()

  if (runError || !runData) {
    throw new Error(runError?.message ?? "Failed to create the digital intelligence run.")
  }

  const runId = runData.id as string
  let status: DigitalIntelligenceStatus = "RUNNING"
  let warnings: string[] = []
  let errors: string[] = []

  try {
    const result = await crawlWebsite(validatedUrl)
    warnings = result.warnings
    errors = result.errors

    const evidence: DigitalEvidence[] = [...result.evidence]

    for (const page of result.pages) {
      if (page.status < 200 || page.status >= 300) {
        evidence.push({
          leadId,
          runId,
          category: "technical",
          key: "page_collection",
          value: { status: page.status },
          sourceUrl: page.url,
          sourceType: "website",
          confidence: "low",
          observationStatus: "FAILED",
          collectedAt: new Date().toISOString(),
        })
        continue
      }
      if (!page.contentType.toLowerCase().includes("html")) {
        evidence.push({
          leadId,
          runId,
          category: "technical",
          key: "page_content",
          value: { contentType: page.contentType },
          sourceUrl: page.url,
          sourceType: "website",
          confidence: "low",
          observationStatus: "UNKNOWN",
          collectedAt: new Date().toISOString(),
        })
        continue
      }
      const pageEvidence = extractEvidenceFromHtml(page.body, page.url, "website")
      for (const entry of pageEvidence) {
        evidence.push({
          ...entry,
          leadId,
          runId,
        })
      }
    }

    if (errors.length) {
      evidence.push({
        leadId,
        runId,
        category: "technical",
        key: "collection_status",
        value: { errors },
        sourceUrl: validatedUrl,
        sourceType: "website",
        confidence: "low",
        observationStatus: "FAILED",
        collectedAt: new Date().toISOString(),
      })
    }

    const deduped = evidence.filter((entry, index, items) => {
      const signature = `${entry.category}:${entry.key}:${entry.sourceUrl ?? ""}:${JSON.stringify(entry.value)}`
      return items.findIndex((candidate) => `${candidate.category}:${candidate.key}:${candidate.sourceUrl ?? ""}:${JSON.stringify(candidate.value)}` === signature) === index
    })

    const { error: evidenceError } = await supabase.from("digital_evidence").insert(
      deduped.map((entry) => ({
        run_id: runId,
        lead_id: leadId,
        category: entry.category,
        key: entry.key,
        value: entry.value,
        source_url: entry.sourceUrl ?? null,
        source_type: entry.sourceType,
        confidence: entry.confidence,
        observation_status: entry.observationStatus ?? (entry.value === null ? "UNKNOWN" : "FOUND"),
        collected_at: entry.collectedAt,
        metadata: entry.metadata ?? {},
      })),
    )

    if (evidenceError) {
      throw evidenceError
    }

    const auditInput = mapEvidenceToAuditInput(deduped, result.complete)
    const audit = await upsertLeadAudit(leadId, auditInput)
    const score = await calculateLeadOpportunityScore(leadId, auditInput)

    status = errors.length > 0
      ? result.pages.length === 0 ? "FAILED" : "PARTIAL"
      : result.complete ? "COMPLETED" : "PARTIAL"

    const { error: updateError } = await supabase
      .from("digital_intelligence_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        pages_crawled: result.pages.length,
        requests_made: result.requestsMade,
        evidence_count: deduped.length,
        error_count: errors.length,
        warnings: warnings,
        error_messages: errors,
      })
      .eq("id", runId)

    if (updateError) {
      throw updateError
    }

    return {
      id: runId,
      leadId,
      status,
      startedAt: runData.started_at,
      completedAt: new Date().toISOString(),
      pagesCrawled: result.pages.length,
      requestsMade: result.requestsMade,
      evidenceCount: deduped.length,
      errorCount: errors.length,
      warnings,
      errorMessages: errors,
      collectorVersion: DIGITAL_INTELLIGENCE_COLLECTOR_VERSION,
      sourceUrl: validatedUrl,
      evidence: deduped,
      audit,
      score,
    } satisfies DigitalIntelligenceResult
  } catch (error) {
    const message = error instanceof Error ? error.message : "Digital intelligence collection failed."
    status = "FAILED"

    const { error: updateError } = await supabase
      .from("digital_intelligence_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        error_messages: [...errors, message],
        error_count: errors.length + 1,
        warnings,
      })
      .eq("id", runId)

    if (updateError) {
      console.error(updateError)
    }

    const serviceError = new Error(message) as Error & { statusCode?: number; code?: string }
    serviceError.statusCode = 500
    serviceError.code = "DIGITAL_INTELLIGENCE_FAILED"
    throw serviceError
  }
}

export async function getLatestDigitalIntelligence(leadId: string): Promise<DigitalIntelligenceRun> {
  const { data, error } = await supabase
    .from("digital_intelligence_runs")
    .select("*")
    .eq("lead_id", leadId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    const notFound = new Error("Digital intelligence run not found.") as Error & { statusCode?: number }
    notFound.statusCode = 404
    throw notFound
  }

  const { data: evidenceData, error: evidenceError } = await supabase
    .from("digital_evidence")
    .select("*")
    .eq("lead_id", leadId)
    .eq("run_id", data.id)
    .order("collected_at", { ascending: true })

  if (evidenceError) throw evidenceError

  return {
    id: data.id,
    leadId: data.lead_id,
    status: data.status,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    pagesCrawled: data.pages_crawled ?? 0,
    requestsMade: data.requests_made ?? 0,
    evidenceCount: data.evidence_count ?? 0,
    errorCount: data.error_count ?? 0,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    errorMessages: Array.isArray(data.error_messages) ? data.error_messages : [],
    collectorVersion: data.collector_version ?? DIGITAL_INTELLIGENCE_COLLECTOR_VERSION,
    sourceUrl: data.source_url,
    evidence: (evidenceData ?? []).map((entry) => ({
      id: entry.id,
      leadId: entry.lead_id,
      runId: entry.run_id,
      category: entry.category,
      key: entry.key,
      value: entry.value,
      sourceUrl: entry.source_url,
      sourceType: entry.source_type,
      confidence: entry.confidence,
      observationStatus: entry.observation_status ?? (entry.value === null ? "UNKNOWN" : "FOUND"),
      collectedAt: entry.collected_at,
      metadata: entry.metadata ?? {},
    })),
  }
}
