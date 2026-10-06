import { supabase } from "../db/supabase.js"
import {
  classifySource,
  deduplicateBusinessRecords,
  extractBusinessCandidatesDetailed,
  extractPaginationTargets,
  getBusinessIdentity,
  normalizeBusinessName,
  normalizeBusinessPhone,
  type BusinessCandidate,
  type DiscoverySourceType,
} from "./discoveryParsing.js"
import {
  fetchSafeResource,
  SAFE_HTTP_CONFIG,
  validateResolvedSafeUrl,
  type HostResolver,
  type RequestBudget,
} from "../utils/safeHttp.js"
import { isDiscoveryPathAllowedByRobots } from "./discoveryPolicy.js"

export const DISCOVERY_CONFIG = {
  maxPages: Number(process.env.DISCOVERY_MAX_PAGES ?? 5),
  maxRequests: Number(process.env.DISCOVERY_MAX_REQUESTS ?? 12),
  maxBusinesses: Number(process.env.DISCOVERY_MAX_BUSINESSES ?? 100),
  maxResponseSize: SAFE_HTTP_CONFIG.maxResponseSize,
  timeoutMs: SAFE_HTTP_CONFIG.timeoutMs,
  maxRedirects: SAFE_HTTP_CONFIG.maxRedirects,
}

export type DiscoveryRunResult = {
  runId: string
  sourceType: DiscoverySourceType
  confidence: "HIGH" | "MEDIUM" | "LOW"
  reasons: string[]
  status: "COMPLETED" | "PARTIAL" | "FAILED"
  sourceUrl: string
  businessesDiscovered: number
  businessesCreated: number
  businessesUpdated: number
  leadsCreated: number
  leadsUpdated: number
  duplicatesSkipped: number
  businesses: Array<{
    businessId: string | null
    leadId: string | null
    name: string
    category: string | null
    address: string | null
    location: string | null
    phone: string | null
    email: string | null
    socialUrls: string[]
    website: string | null
    profileUrl: string | null
    sourcePageUrl: string
    result: "CREATED" | "UPDATED" | "FAILED"
  }>
  pagesVisited: number
  requestsMade: number
  warnings: string[]
  errors: string[]
}

type PersistResult = { businessId: string; leadId: string; businessCreated: boolean; leadCreated: boolean }

function serviceError(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code })
}

async function findExistingBusiness(input: {
  identity: ReturnType<typeof getBusinessIdentity>
  candidate: BusinessCandidate
  sourceUrl: string
}) {
  const { identity, candidate, sourceUrl } = input

  const { data: sourcePageLink, error: sourcePageLinkError } = await supabase
    .from("business_source_links")
    .select("business_id, identity_key, evidence")
    .eq("source_url", sourceUrl)
    .eq("source_page_url", candidate.sourcePageUrl)
    .limit(DISCOVERY_CONFIG.maxBusinesses)
  if (sourcePageLinkError) throw sourcePageLinkError
  const matchingSourceLink = (sourcePageLink ?? []).find((link) => {
    const evidence = link.evidence as Record<string, { value?: unknown }> | null
    const linkedPhone = typeof evidence?.phone?.value === "string" ? evidence.phone.value.replace(/\D/g, "") : null
    const linkedWebsite = typeof evidence?.businessWebsite?.value === "string" ? getBusinessIdentity({ ...candidate, website: evidence.businessWebsite.value }).websiteDomain : null
    const linkedAddress = typeof evidence?.address?.value === "string" ? evidence.address.value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : null
    const linkedName = typeof evidence?.name?.value === "string" ? normalizeBusinessName(evidence.name.value) : null
    const ordinalMatch = candidate.identityOrdinal !== undefined && evidence?.identityOrdinal?.value === candidate.identityOrdinal && linkedName === identity.normalizedName
    const phoneCompatible = !identity.phone || !linkedPhone || normalizeBusinessPhone(linkedPhone) === identity.phone
    const websiteCompatible = !identity.websiteDomain || !linkedWebsite || linkedWebsite === identity.websiteDomain
    const addressCompatible = !identity.normalizedAddress || !linkedAddress || normalizeBusinessName(linkedAddress) === identity.normalizedAddress
    return Boolean(
      identity.websiteDomain && linkedWebsite === identity.websiteDomain ||
      identity.phone && linkedPhone === identity.phone ||
      identity.normalizedAddress && linkedName === identity.normalizedName && linkedAddress === identity.normalizedAddress ||
      ordinalMatch && phoneCompatible && websiteCompatible && addressCompatible,
    )
  })
  if (matchingSourceLink?.business_id) {
    const { data, error } = await supabase.from("businesses")
      .select("id, name, category, industry, location, address, phone, email, website_url")
      .eq("id", matchingSourceLink.business_id)
      .maybeSingle()
    if (error) throw error
    if (data) return data
  }

  const { data: sourceLink, error: sourceLinkError } = await supabase
    .from("business_source_links")
    .select("business_id")
    .eq("source_url", sourceUrl)
    .eq("identity_key", identity.identityKey)
    .limit(1)
    .maybeSingle()
  if (sourceLinkError) throw sourceLinkError
  if (sourceLink?.business_id) {
    const { data, error } = await supabase.from("businesses")
      .select("id, name, category, industry, location, address, phone, email, website_url")
      .eq("id", sourceLink.business_id)
      .maybeSingle()
    if (error) throw error
    if (data) return data
  }

  if (identity.websiteDomain) {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, category, industry, location, address, phone, email, website_url")
      .eq("discovery_identity_domain", identity.websiteDomain)
      .maybeSingle()
    if (error && error.code !== "PGRST116") throw error
    if (data) return data
  }

  if (candidate.website) {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, category, industry, location, address, phone, email, website_url")
      .eq("website_url", candidate.website)
      .maybeSingle()
    if (error && error.code !== "PGRST116") throw error
    if (data) return data
  }

  if (identity.phone) {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, category, industry, location, address, phone, email, website_url")
      .eq("discovery_identity_phone", identity.phone)
      .maybeSingle()
    if (error && error.code !== "PGRST116") throw error
    if (data) return data
  }

  if (candidate.phone) {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, category, industry, location, address, phone, email, website_url")
      .eq("phone", candidate.phone)
      .maybeSingle()
    if (error && error.code !== "PGRST116") throw error
    if (data) return data
  }

  if (identity.normalizedAddress) {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, category, industry, location, address, phone, email, website_url")
      .eq("discovery_identity_name_address", `${identity.normalizedName}|${identity.normalizedAddress}`)
      .maybeSingle()
    if (error && error.code !== "PGRST116") throw error
    if (data) return data
  }

  return null
}

async function upsertBusinessSourceLink(input: {
  businessId: string
  runId: string
  sourceType: DiscoverySourceType
  sourceUrl: string
  sourcePageUrl: string
  identityKey: string
  candidate: BusinessCandidate
}) {
  const candidate = input.candidate
  const evidence = {
    identityOrdinal: { value: candidate.identityOrdinal ?? null, observationStatus: "FOUND" },
    name: { value: candidate.name, observationStatus: "FOUND" },
    description: { value: candidate.description, observationStatus: candidate.description ? "FOUND" : "UNKNOWN" },
    category: { value: candidate.category, observationStatus: candidate.category ? "FOUND" : "UNKNOWN" },
    address: { value: candidate.address, observationStatus: candidate.address ? "FOUND" : "UNKNOWN" },
    phone: { value: candidate.phone, observationStatus: candidate.phone ? "FOUND" : "UNKNOWN" },
    email: { value: candidate.email, observationStatus: candidate.email ? "FOUND" : "UNKNOWN" },
    businessWebsite: { value: candidate.website, observationStatus: candidate.website ? "FOUND" : "UNKNOWN" },
    socialUrls: { value: candidate.socialUrls, observationStatus: candidate.socialUrls.length ? "FOUND" : "UNKNOWN" },
    directoryProfile: { value: candidate.profileUrl, observationStatus: candidate.profileUrl ? "FOUND" : "UNKNOWN" },
  }

  const { error } = await supabase.from("business_source_links").upsert({
    business_id: input.businessId,
    discovery_run_id: input.runId,
    source_type: input.sourceType,
    source_url: input.sourceUrl,
    source_page_url: input.sourcePageUrl,
    source_origin: "MANUAL",
    identity_key: input.identityKey,
    evidence,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "business_id,source_url,source_page_url" })

  if (error) throw error
}

async function persistCandidate(input: {
  candidate: BusinessCandidate
  sourceType: DiscoverySourceType
  sourceUrl: string
  runId: string
  warnings: string[]
}): Promise<PersistResult> {
  const candidate = { ...input.candidate }
  let websiteUrl: string | null = null

  if (candidate.website) {
    try {
      websiteUrl = await validateResolvedSafeUrl(candidate.website)
    } catch (error) {
      input.warnings.push(`${candidate.name}: discovered website URL was rejected by security validation (${error instanceof Error ? error.message : "invalid URL"}).`)
      candidate.website = null
    }
  }

  if (candidate.profileUrl) {
    try {
      candidate.profileUrl = await validateResolvedSafeUrl(candidate.profileUrl)
    } catch {
      input.warnings.push(`${candidate.name}: listing profile URL was rejected by security validation.`)
      candidate.profileUrl = null
    }
  }

  const identity = getBusinessIdentity({ ...candidate, website: websiteUrl })

  const existing = await findExistingBusiness({ identity, candidate: { ...candidate, website: websiteUrl }, sourceUrl: input.sourceUrl })
  const businessPatch: Record<string, unknown> = {
  }
  if (identity.websiteDomain) businessPatch.discovery_identity_domain = identity.websiteDomain
  if (identity.phone) businessPatch.discovery_identity_phone = identity.phone
  if (identity.normalizedAddress) businessPatch.discovery_identity_name_address = `${identity.normalizedName}|${identity.normalizedAddress}`
  if (candidate.category) businessPatch.category = candidate.category
  if (candidate.industry) businessPatch.industry = candidate.industry
  if (candidate.address) businessPatch.address = candidate.address
  if (candidate.location) businessPatch.location = candidate.location
  if (candidate.phone) businessPatch.phone = candidate.phone
  if (candidate.email) businessPatch.email = candidate.email
  if (websiteUrl) businessPatch.website_url = websiteUrl
  if (candidate.description) businessPatch.description = candidate.description
  businessPatch.updated_at = new Date().toISOString()

  let businessId: string
  let businessCreated = false

  if (existing) {
    const { error } = await supabase.from("businesses").update(businessPatch).eq("id", existing.id)
    if (error) throw error
    businessId = existing.id
  } else {
    const { data, error } = await supabase.from("businesses").insert({
      name: candidate.name,
      status: "active",
      ...businessPatch,
    }).select("id").single()
    if (error || !data) {
      if (error?.code === "23505") {
        const raced = await findExistingBusiness({ identity, candidate, sourceUrl: input.sourceUrl })
        if (raced) return persistCandidate({ ...input, candidate })
      }
      throw error ?? new Error("Failed to create discovered business.")
    }
    businessId = data.id
    businessCreated = true
  }

  const { data: existingLead, error: leadLookupError } = await supabase
    .from("leads")
    .select("id")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (leadLookupError) throw leadLookupError

  let leadCreated = false
  let leadId = existingLead?.id as string | undefined
  if (!leadId) {
    const { data, error } = await supabase.from("leads").insert({
      business_id: businessId,
      status: "NEW",
      priority: "medium",
      source: input.sourceType === "BUSINESS_WEBSITE"
        ? "website"
        : input.sourceType === "DIRECTORY" || input.sourceType === "LISTING_PAGE"
          ? "directory"
          : "manual",
      opportunity_score: null,
      qualification_status: "unqualified",
    }).select("id").single()
    if (error || !data) throw error ?? new Error("Failed to create a lead for discovered business.")
    leadId = data.id
    leadCreated = true
  }
  if (!leadId) throw new Error("Discovered business is missing its lead record.")

  await upsertBusinessSourceLink({
    businessId,
    runId: input.runId,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    sourcePageUrl: candidate.sourcePageUrl,
    identityKey: identity.identityKey,
    candidate,
  })

  return {
    businessId,
    leadId,
    businessCreated,
    leadCreated,
  }
}

export async function runDiscovery(
  rawSourceUrl: string,
  resolver?: HostResolver,
): Promise<DiscoveryRunResult> {
  let sourceUrl: string
  try {
    sourceUrl = await validateResolvedSafeUrl(rawSourceUrl, resolver)
  } catch (error) {
    throw serviceError(
      error instanceof Error ? error.message : "The source URL could not be validated.",
      400,
      "INVALID_SOURCE_URL",
    )
  }
  const runInsert = await supabase.from("discovery_runs").insert({
    source_url: sourceUrl,
    source_origin: "MANUAL",
    source_type: "UNKNOWN",
    confidence: "LOW",
    status: "RUNNING",
  }).select("id, started_at").single()
  if (runInsert.error || !runInsert.data) throw runInsert.error ?? new Error("Failed to create discovery run.")

  const runId = runInsert.data.id as string
  const warnings: string[] = []
  const errors: string[] = []
  type QueuedPage = { url: string; role: "ROOT_SOURCE" | "DIRECTORY_PAGE" | "LISTING_PAGE" }
  const pages = new Map<string, { html: string; finalUrl: string; role: QueuedPage["role"] }>()
  const queue: QueuedPage[] = [{ url: sourceUrl, role: "ROOT_SOURCE" }]
  const visited = new Set<string>()
  const requestBudget: RequestBudget = { count: 0, limit: DISCOVERY_CONFIG.maxRequests }
  let robotsText = ""
  let robotsAllowsCrawling = true
  let skippedByRobots = false
  let sourceType: DiscoverySourceType = "UNKNOWN"
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW"
  let reasons: string[] = []

  const enqueueSameOrigin = async (target: string, role: QueuedPage["role"], candidateName?: string) => {
    if (visited.size + queue.length >= DISCOVERY_CONFIG.maxPages) {
      warnings.push("The discovery page limit was reached; additional links were not queued.")
      return
    }
    try {
      const validatedTarget = await validateResolvedSafeUrl(target, resolver)
      if (new URL(validatedTarget).origin !== new URL(sourceUrl).origin || visited.has(validatedTarget)) return
      if (!isDiscoveryPathAllowedByRobots(validatedTarget, robotsText)) {
        skippedByRobots = true
        warnings.push(candidateName
          ? `${candidateName}: the directory robots.txt rules disallow this profile path.`
          : "The source robots.txt rules disallow a pagination path.")
        return
      }
      if (!queue.some((entry) => entry.url === validatedTarget)) queue.push({ url: validatedTarget, role })
    } catch {
      warnings.push(candidateName
        ? `${candidateName}: a profile URL was rejected by source URL security validation.`
        : "A pagination target was rejected by URL security validation.")
    }
  }

  try {
    const robotsUrl = new URL("/robots.txt", sourceUrl).toString()
    try {
      const robots = await fetchSafeResource(
        robotsUrl,
        {
          timeoutMs: DISCOVERY_CONFIG.timeoutMs,
          maxRedirects: DISCOVERY_CONFIG.maxRedirects,
          maxResponseSize: Math.min(DISCOVERY_CONFIG.maxResponseSize, 256_000),
        },
        requestBudget,
        resolver,
      )
      if (robots.status === 200) {
        robotsText = robots.body
      } else if (robots.status !== 404) {
        robotsAllowsCrawling = false
        warnings.push(`robots.txt returned HTTP ${robots.status}; source pages were not fetched.`)
      }
    } catch (error) {
      robotsAllowsCrawling = false
      warnings.push(`robots.txt could not be checked; source pages were not fetched (${error instanceof Error ? error.message : "request failed"}).`)
    }

    if (!robotsAllowsCrawling) queue.length = 0

    while (queue.length && pages.size < DISCOVERY_CONFIG.maxPages && requestBudget.count < requestBudget.limit) {
      const currentPage = queue.shift()
      if (!currentPage || visited.has(currentPage.url)) continue
      const currentUrl = currentPage.url
      visited.add(currentUrl)
      if (!isDiscoveryPathAllowedByRobots(currentUrl, robotsText)) {
        skippedByRobots = true
        warnings.push("The source robots.txt rules disallow the requested path.")
        continue
      }
      let response: Awaited<ReturnType<typeof fetchSafeResource>>
      try {
        response = await fetchSafeResource(
          currentUrl,
          {
            timeoutMs: DISCOVERY_CONFIG.timeoutMs,
            maxRedirects: DISCOVERY_CONFIG.maxRedirects,
            maxResponseSize: DISCOVERY_CONFIG.maxResponseSize,
          },
          requestBudget,
          resolver,
        )
      } catch (error) {
        warnings.push(`${currentUrl}: ${error instanceof Error ? error.message : "Page fetch failed."}`)
        continue
      }
      if (!response.ok) {
        warnings.push(`${response.finalUrl} responded with HTTP ${response.status}.`)
        continue
      }
      if (!response.contentType.toLowerCase().includes("html")) {
        warnings.push(`${response.finalUrl} did not return HTML; it was not parsed.`)
        continue
      }
      pages.set(response.finalUrl, { html: response.body, finalUrl: response.finalUrl, role: currentPage.role })
      const classification = classifySource({ url: response.finalUrl, html: response.body })
      if (pages.size === 1) {
        sourceType = classification.sourceType
        confidence = classification.confidence
        reasons = classification.reasons
      }

      if (sourceType === "DIRECTORY" || classification.sourceType === "DIRECTORY") {
        for (const target of extractPaginationTargets(response.body, response.finalUrl)) {
          await enqueueSameOrigin(target, "DIRECTORY_PAGE")
        }

        const pageCandidates = extractBusinessCandidatesDetailed({
          html: response.body,
          sourceUrl,
          sourcePageUrl: response.finalUrl,
          discoveredAt: new Date().toISOString(),
          sourcePageRole: "DIRECTORY_PAGE",
        }).records
        for (const candidate of pageCandidates) {
          if (!candidate.profileUrl) continue
          await enqueueSameOrigin(candidate.profileUrl, "LISTING_PAGE", candidate.name)
        }
      }
    }

    if (queue.length) warnings.push("Discovery page/request limit reached; remaining pages were not fetched.")

    const extracted: BusinessCandidate[] = []
    for (const page of pages.values()) {
      const pageClassification = classifySource({ url: page.finalUrl, html: page.html })
      if (!(["BUSINESS_WEBSITE", "DIRECTORY", "LISTING_PAGE"] as DiscoverySourceType[]).includes(pageClassification.sourceType)) continue
      const pageCandidates = extractBusinessCandidatesDetailed({
        html: page.html,
        sourceUrl,
        sourcePageUrl: page.finalUrl,
        discoveredAt: new Date().toISOString(),
        sourcePageRole: page.role,
      }).records
      extracted.push(...pageCandidates.map((candidate) => ({
        ...candidate,
        website: candidate.website ?? (page.role === "ROOT_SOURCE" && sourceType === "BUSINESS_WEBSITE" ? page.finalUrl : null),
        profileUrl: candidate.profileUrl ?? (page.role === "LISTING_PAGE" ? page.finalUrl : null),
      })))
    }
    const { records: deduplicatedCandidates, duplicatesSkipped: withinRunDuplicates } = deduplicateBusinessRecords(extracted)
    const candidates = deduplicatedCandidates.slice(0, DISCOVERY_CONFIG.maxBusinesses)
    const cappedCandidates = deduplicatedCandidates.length - candidates.length
    if (deduplicatedCandidates.length > candidates.length) {
      warnings.push(`The business candidate limit (${DISCOVERY_CONFIG.maxBusinesses}) was reached; additional records were not persisted.`)
    }
    let businessesCreated = 0
    let businessesUpdated = 0
    let leadsCreated = 0
    let leadsUpdated = 0
    let duplicatesSkipped = withinRunDuplicates + cappedCandidates
    const discoveredBusinesses: DiscoveryRunResult["businesses"] = []

    for (const candidate of candidates) {
      try {
        const result = await persistCandidate({ candidate, sourceType, sourceUrl, runId, warnings })
        if (result.businessCreated) businessesCreated += 1
        else businessesUpdated += 1
        if (result.leadCreated) leadsCreated += 1
        else leadsUpdated += 1
        discoveredBusinesses.push({
          businessId: result.businessId,
          leadId: result.leadId,
          name: candidate.name,
          category: candidate.category,
          address: candidate.address,
          location: candidate.location,
          phone: candidate.phone,
          email: candidate.email,
          socialUrls: candidate.socialUrls,
          website: candidate.website,
          profileUrl: candidate.profileUrl,
          sourcePageUrl: candidate.sourcePageUrl,
          result: result.businessCreated || result.leadCreated ? "CREATED" : "UPDATED",
        })
      } catch (error) {
        errors.push(`${candidate.name}: ${error instanceof Error ? error.message : "Failed to persist candidate."}`)
        discoveredBusinesses.push({
          businessId: null,
          leadId: null,
          name: candidate.name,
          category: candidate.category,
          address: candidate.address,
          location: candidate.location,
          phone: candidate.phone,
          email: candidate.email,
          socialUrls: candidate.socialUrls,
          website: candidate.website,
          profileUrl: candidate.profileUrl,
          sourcePageUrl: candidate.sourcePageUrl,
          result: "FAILED",
        })
      }
    }

    const status = pages.size === 0
      ? skippedByRobots || !robotsAllowsCrawling ? "PARTIAL" : "FAILED"
      : errors.length ? candidates.length === errors.length ? "FAILED" : "PARTIAL"
        : queue.length || warnings.length || sourceType === "UNKNOWN" ? "PARTIAL" : "COMPLETED"
    const result: DiscoveryRunResult = {
      runId,
      sourceType,
      confidence,
      reasons,
      status,
      sourceUrl,
      businessesDiscovered: extracted.length,
      businessesCreated,
      businessesUpdated,
      leadsCreated,
      leadsUpdated,
      duplicatesSkipped,
      businesses: discoveredBusinesses,
      pagesVisited: pages.size,
      requestsMade: requestBudget.count,
      warnings,
      errors,
    }

    const { error: updateError } = await supabase.from("discovery_runs").update({
      source_type: sourceType,
      confidence,
      status,
      reasons,
      warnings,
      errors,
      pages_visited: pages.size,
      requests_made: requestBudget.count,
      businesses_discovered: extracted.length,
      businesses_created: businessesCreated,
      businesses_updated: businessesUpdated,
      leads_created: leadsCreated,
      leads_updated: leadsUpdated,
      duplicates_skipped: duplicatesSkipped,
      result,
      completed_at: new Date().toISOString(),
    }).eq("id", runId)
    if (updateError) throw updateError

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed."
    errors.push(message)
    await supabase.from("discovery_runs").update({
      status: "FAILED",
      errors,
      warnings,
      pages_visited: pages.size,
      requests_made: requestBudget.count,
      completed_at: new Date().toISOString(),
    }).eq("id", runId)
    throw serviceError(message, 500, "DISCOVERY_FAILED")
  }
}

export async function getDiscoveryRun(runId: string) {
  const { data, error } = await supabase.from("discovery_runs").select("result").eq("id", runId).maybeSingle()
  if (error) throw error
  if (!data) throw serviceError("Discovery run not found.", 404, "DISCOVERY_RUN_NOT_FOUND")
  return data.result
}
