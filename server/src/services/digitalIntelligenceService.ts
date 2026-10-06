import { isIP } from "node:net"

import { supabase } from "../db/supabase.js"
import { getLeadById } from "./leadService.js"
import { calculateLeadOpportunityScore } from "./opportunityScoreService.js"
import { upsertLeadAudit } from "./digitalAuditService.js"

export const DIGITAL_INTELLIGENCE_COLLECTOR_VERSION = "v1"

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
}

function isPrivateIp(hostname: string): boolean {
  if (!hostname || hostname === "localhost") return true

  if (hostname.includes(":")) {
    return hostname === "::1" || hostname === "[::1]"
  }

  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1) === "::1"
  }

  if (isIP(hostname) === 0) return false

  const addr = hostname.split(".").map(Number)

  if (addr.length !== 4 || addr.some((part) => Number.isNaN(part))) {
    return false
  }

  return (
    addr[0] === 10 ||
    (addr[0] === 172 && addr[1] >= 16 && addr[1] <= 31) ||
    (addr[0] === 192 && addr[1] === 168) ||
    (addr[0] === 127) ||
    (addr[0] === 0 && addr[1] === 0 && addr[2] === 0 && addr[3] === 0)
  )
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().trim()

  if (!host) return true
  if (host === "localhost" || host.endsWith(".localhost")) return true
  if (host === "localhost.localdomain") return true
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return true
  if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("172.")) return true
  if (host.includes(".internal") || host.includes(".local")) return true

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

async function fetchWithTimeout(url: string, timeoutMs: number, maxRedirects: number) {
  let currentUrl = url
  const history: string[] = []

  for (let redirectRound = 0; redirectRound <= maxRedirects; redirectRound += 1) {
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
        const nextUrl = new URL(location, currentUrl).toString()
        currentUrl = nextUrl
        continue
      }

      const contents = await response.text()
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
  robotsTxt: boolean
  sitemap: boolean
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
  const robotsTxt = /robots\.txt/i.test(html)
  const sitemap = /sitemap\.(xml|xsl|html)|<loc>.*sitemap/i.test(html)
  const hasGoogleMaps = /maps\.google\.|google\.com\/maps|google\.com\/maps\?/i.test(html)

  return {
    title,
    metaDescription,
    canonical,
    viewport,
    hasStructuredData,
    robotsTxt,
    sitemap,
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
  }

  if (signals.viewport) {
    evidence.push({
      leadId: "",
      category: "technology",
      key: "viewport_meta",
      value: true,
      sourceUrl,
      sourceType: "website",
      confidence: "medium",
      collectedAt: new Date().toISOString(),
      metadata: { viewport: true },
    })
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
  }

  if (/robots\.txt/i.test(lowerHtml)) {
    evidence.push({
      leadId: "",
      category: "seo",
      key: "robots_txt_reference",
      value: true,
      sourceUrl,
      sourceType: "website",
      confidence: "medium",
      collectedAt: new Date().toISOString(),
      metadata: { robotsTxt: true },
    })
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
  const seededUrl = validateWebsiteUrl(url)
  const pageQueue = [{ url: seededUrl, depth: 0 }]
  const visitedUrls = new Set<string>()
  const pages: Array<{ url: string; status: number; body: string; contentType: string; history: string[] }> = []
  const warnings: string[] = []
  const errors: string[] = []
  const requestsMade = { count: 0 }

  while (pageQueue.length > 0 && pages.length < DIGITAL_INTELLIGENCE_CONFIG.maxPagesPerRun) {
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
      )

      requestsMade.count += 1
      pages.push({
        url: response.finalUrl,
        status: response.status,
        body: response.body,
        contentType: response.contentType,
        history: response.history,
      })

      if (!response.ok) {
        warnings.push(`Page ${normalized} responded with ${response.status}.`)
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

  return { pages, warnings, errors, requestsMade: requestsMade.count }
}

export function mapEvidenceToAuditInput(evidence: DigitalEvidence[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  const findKey = (key: string) => evidence.some((entry) => entry.key === key)

  result.hasWebsite = findKey("website_reachable") ? true : null
  result.hasGoogleBusinessProfile = findKey("google_maps_link") ? true : null
  result.hasActiveSocial = evidence.some((entry) => entry.category === "social" && entry.key === "social_profile") ? true : null
  result.hasWhatsApp = findKey("whatsapp_link") ? true : null
  result.hasContactMethod = findKey("phone_number") || findKey("email_address") ? true : null
  result.hasOnlineBooking = findKey("booking_link") ? true : null
  result.hasOnlineOrdering = findKey("ordering_link") ? true : null
  result.hasStrongCTA = findKey("cta") ? true : null
  result.hasBasicSEO = findKey("page_title") || findKey("meta_description") || findKey("canonical_url") ? true : null
  result.hasVisibleBusinessInformation =
    findKey("business_name") || findKey("phone_number") || findKey("email_address") ? true : null
  result.hasMobileFriendlyWebsite = findKey("viewport_meta") ? true : null

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

    const evidence: DigitalEvidence[] = []

    for (const page of result.pages) {
      const pageEvidence = extractEvidenceFromHtml(page.body, page.url, "website")
      for (const entry of pageEvidence) {
        evidence.push({
          ...entry,
          leadId,
          runId,
        })
      }
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
        collected_at: entry.collectedAt,
        metadata: entry.metadata ?? {},
      })),
    )

    if (evidenceError) {
      throw evidenceError
    }

    const auditInput = mapEvidenceToAuditInput(deduped)
    const audit = await upsertLeadAudit(leadId, auditInput)
    const score = await calculateLeadOpportunityScore(leadId, auditInput)

    status = errors.length > 0 ? "PARTIAL" : "COMPLETED"

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
      collectedAt: entry.collected_at,
      metadata: entry.metadata ?? {},
    })),
  }
}
