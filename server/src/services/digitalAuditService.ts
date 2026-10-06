import { supabase } from "../db/supabase.js"

export const DIGITAL_AUDIT_FACTOR_KEYS = [
  "hasWebsite",
  "hasGoogleBusinessProfile",
  "hasActiveSocial",
  "hasOnlineOrdering",
  "hasOnlineBooking",
  "hasWhatsApp",
  "hasContactMethod",
  "hasMobileFriendlyWebsite",
  "hasStrongCTA",
  "hasBasicSEO",
  "hasVisibleBusinessInformation",
] as const

export type DigitalAuditFactorKey = typeof DIGITAL_AUDIT_FACTOR_KEYS[number]

export type DigitalAuditFactorStatus = "KNOWN" | "UNKNOWN"

export type DigitalAuditFactor = {
  key: DigitalAuditFactorKey
  value: boolean | null
  status: DigitalAuditFactorStatus
  evidence?: string | null
}

export type DigitalAuditRecord = {
  id: string
  leadId: string
  auditVersion: string
  createdAt: string
  factors: DigitalAuditFactor[]
}

export function buildAuditFactor(
  key: DigitalAuditFactorKey,
  value: boolean | null,
  evidence?: string | null,
): DigitalAuditFactor {
  return {
    key,
    value,
    status: value === null ? "UNKNOWN" : "KNOWN",
    evidence: evidence ?? undefined,
  }
}

export function getDefaultAuditFactors(): DigitalAuditFactor[] {
  return DIGITAL_AUDIT_FACTOR_KEYS.map((key) => buildAuditFactor(key, null))
}

export function normalizeAuditFactors(
  input: Record<string, unknown> | undefined,
): DigitalAuditFactor[] {
  const source = input && typeof input === "object" ? input : {}
  const factorEntries = Object.entries(source)

  const normalized = DIGITAL_AUDIT_FACTOR_KEYS.map((key) => {
    const raw = factorEntries.find(([entryKey]) => entryKey === key)

    if (!raw) {
      return buildAuditFactor(key, null)
    }

    const [, value] = raw

    if (value === null) {
      return buildAuditFactor(key, null)
    }

    if (typeof value === "boolean") {
      return buildAuditFactor(key, value)
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "value" in value
    ) {
      const nested = value as {
        value?: unknown
        status?: unknown
        evidence?: unknown
      }

      const factorValue =
        nested.value === null || typeof nested.value === "boolean"
          ? nested.value
          : null

      const status: DigitalAuditFactorStatus =
        nested.status === "KNOWN" || nested.status === "UNKNOWN"
          ? (nested.status as DigitalAuditFactorStatus)
          : factorValue === null
            ? "UNKNOWN"
            : "KNOWN"

      return {
        key,
        value: factorValue,
        status,
        evidence:
          typeof nested.evidence === "string" ? nested.evidence : undefined,
      }
    }

    throw new Error(`Invalid audit value for ${key}.`)
  })

  return normalized
}

export async function getLatestLeadAudit(
  leadId: string,
): Promise<DigitalAuditRecord> {
  const { data, error } = await supabase
    .from("lead_digital_audits")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === "PGRST116") {
      const notFound = new Error("Digital audit not found.") as Error & {
        statusCode?: number
      }

      notFound.statusCode = 404
      throw notFound
    }

    throw error
  }

  if (!data) {
    const notFound = new Error("Digital audit not found.") as Error & {
      statusCode?: number
    }

    notFound.statusCode = 404
    throw notFound
  }

  return {
    id: data.id,
    leadId: data.lead_id,
    auditVersion: data.audit_version,
    createdAt: data.created_at,
    factors: Array.isArray(data.factors) ? data.factors : [],
  }
}

export async function upsertLeadAudit(
  leadId: string,
  input: Record<string, unknown> | undefined,
): Promise<DigitalAuditRecord> {
  const normalized = normalizeAuditFactors(input)

  const { data, error } = await supabase
    .from("lead_digital_audits")
    .insert({
      lead_id: leadId,
      audit_version: "v1",
      factors: normalized,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return {
    id: data.id,
    leadId: data.lead_id,
    auditVersion: data.audit_version,
    createdAt: data.created_at,
    factors: Array.isArray(data.factors) ? data.factors : normalized,
  }
}
