import { supabase } from "../db/supabase.js"

import { normalizeLeadInput, isLeadStatus } from "../utils/leadValidation.js"

function getBusinessRecord(record: unknown) {
  if (Array.isArray(record)) {
    return record[0] ?? null
  }

  return record ?? null
}

export type LeadPayload = {
  name: string

  industry?: string

  location?: string

  status?: string
}

function mapLead(row: any, business: any) {
  return {
    id: row.id,

    businessId: business?.id ?? "",

    name: business?.name ?? "",

    industry: business?.industry ?? null,

    location: business?.location ?? null,

    status: row.status,

    priority: row.priority ?? null,

    source: row.source ?? null,

    opportunityScore: row.opportunity_score ?? null,

    qualificationStatus: row.qualification_status ?? null,

    firstContactedAt: row.first_contacted_at ?? null,

    lastContactedAt: row.last_contacted_at ?? null,

    nextFollowUpAt: row.next_follow_up_at ?? null,

    createdAt: row.created_at,

    updatedAt: row.updated_at,
  }
}

export async function getLeads() {
  const { data, error } = await supabase

    .from("leads")

    .select(
      `
        id,
        status,
        priority,
        source,
        opportunity_score,
        qualification_status,
        first_contacted_at,
        last_contacted_at,
        next_follow_up_at,
        created_at,
        updated_at,
        businesses (
          id,
          name,
          description,
          category,
          industry,
          location,
          address,
          latitude,
          longitude,
          phone,
          email,
          status,
          created_at,
          updated_at
        )
      `,
    )

    .order("created_at", { ascending: false })

  if (error) throw error

  return (data ?? []).map((row: any) => {
    const business = getBusinessRecord(row.businesses)

    return mapLead(row, business)
  })
}

export async function getLeadById(id: string) {
  const { data, error } = await supabase

    .from("leads")

    .select(
      `
        id,
        status,
        priority,
        source,
        opportunity_score,
        qualification_status,
        first_contacted_at,
        last_contacted_at,
        next_follow_up_at,
        created_at,
        updated_at,
        businesses (
          id,
          name,
          description,
          category,
          industry,
          location,
          address,
          latitude,
          longitude,
          phone,
          email,
          status,
          created_at,
          updated_at
        )
      `,
    )

    .eq("id", id)

    .single()

  if (error) {
    if (error.code === "PGRST116") {
      const notFound = new Error("Lead not found.") as Error & {
        statusCode?: number
      }

      notFound.statusCode = 404

      throw notFound
    }

    throw error
  }

  const business = getBusinessRecord(data.businesses)

  return mapLead(data, business)
}

export async function createLeadWithBusiness(input: LeadPayload) {
  const normalized = normalizeLeadInput({
    name: input.name,

    industry: input.industry,

    location: input.location,

    status: input.status as any,
  })

  const { data, error } = await supabase.rpc("create_lead_with_business", {
    p_name: normalized.name,

    p_industry: normalized.industry || null,

    p_location: normalized.location || null,

    p_status: normalized.status,
  })

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    const message =
      error?.message ?? "Failed to create the lead record."

    const serviceError = new Error(message) as Error & {
      statusCode?: number
      code?: string
    }

    serviceError.statusCode = 500
    serviceError.code = "LEAD_CREATE_FAILED"

    if (/Business name is required|Invalid lead status/i.test(message)) {
      serviceError.statusCode = 400
      serviceError.code = "INVALID_LEAD_INPUT"
    }

    throw serviceError
  }

  const record = data[0]

  return {
    id: record.id,

    businessId: record.business_id,

    name: record.business_name,

    industry: record.business_industry ?? null,

    location: record.business_location ?? null,

    status: record.status,

    priority: record.priority ?? null,

    source: record.source ?? null,

    opportunityScore: record.opportunity_score ?? null,

    qualificationStatus: record.qualification_status ?? null,

    firstContactedAt: record.first_contacted_at ?? null,

    lastContactedAt: record.last_contacted_at ?? null,

    nextFollowUpAt: record.next_follow_up_at ?? null,

    createdAt: record.created_at,

    updatedAt: record.updated_at,
  }
}

export async function updateLeadStatus(id: string, status: string) {
  if (!isLeadStatus(status)) {
    throw new Error("Invalid lead status.")
  }

  const { data, error } = await supabase

    .from("leads")

    .update({ status })

    .eq("id", id)

    .select(
      `
        id,
        status,
        priority,
        source,
        opportunity_score,
        qualification_status,
        first_contacted_at,
        last_contacted_at,
        next_follow_up_at,
        created_at,
        updated_at,
        businesses (
          id,
          name,
          description,
          category,
          industry,
          location,
          address,
          latitude,
          longitude,
          phone,
          email,
          status,
          created_at,
          updated_at
        )
      `,
    )

    .single()

  if (error) {
    if (error.code === "PGRST116") {
      const notFound = new Error("Lead not found.") as Error & {
        statusCode?: number
      }

      notFound.statusCode = 404

      throw notFound
    }

    throw error
  }

  const business = getBusinessRecord(data.businesses)

  return mapLead(data, business)
}
