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

  const { data: business, error: businessError } = await supabase

    .from("businesses")

    .insert([
      {
        name: normalized.name,

        industry: normalized.industry,

        location: normalized.location,

        status: "active",
      },
    ])

    .select()

    .single()

  if (businessError || !business) {
    throw businessError ?? new Error("Failed to create the business record.")
  }

  const { data: lead, error: leadError } = await supabase

    .from("leads")

    .insert([
      {
        business_id: business.id,

        status: normalized.status,

        priority: "medium",

        source: "manual",

        opportunity_score: 0,

        qualification_status: "unqualified",
      },
    ])

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

  if (leadError || !lead) {
    throw leadError ?? new Error("Failed to create the lead record.")
  }

  const createdLeadBusiness = getBusinessRecord(lead.businesses)

  return mapLead(lead, createdLeadBusiness ?? business)
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
