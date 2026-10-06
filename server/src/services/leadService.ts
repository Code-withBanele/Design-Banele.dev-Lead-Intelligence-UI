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

    return {
      id: row.id,
      name: business?.name ?? "",
      industry: business?.industry ?? "",
      location: business?.location ?? "",
      status: row.status,
      priority: row.priority ?? "medium",
      source: row.source ?? "manual",
      opportunityScore: row.opportunity_score ?? 0,
      qualificationStatus: row.qualification_status ?? "unqualified",
      firstContactedAt: row.first_contacted_at ?? null,
      lastContactedAt: row.last_contacted_at ?? null,
      nextFollowUpAt: row.next_follow_up_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
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
      const notFound = new Error("Lead not found.") as Error & { statusCode?: number }
      notFound.statusCode = 404
      throw notFound
    }

    throw error
  }

  const business = getBusinessRecord(data.businesses)

  return {
    id: data.id,
    name: business?.name ?? "",
    industry: business?.industry ?? "",
    location: business?.location ?? "",
    status: data.status,
    priority: data.priority ?? "medium",
    source: data.source ?? "manual",
    opportunityScore: data.opportunity_score ?? 0,
    qualificationStatus: data.qualification_status ?? "unqualified",
    firstContactedAt: data.first_contacted_at ?? null,
    lastContactedAt: data.last_contacted_at ?? null,
    nextFollowUpAt: data.next_follow_up_at ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
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

  return {
    id: lead.id,
    name: createdLeadBusiness?.name ?? business.name,
    industry: createdLeadBusiness?.industry ?? business.industry ?? "",
    location: createdLeadBusiness?.location ?? business.location ?? "",
    status: lead.status,
    priority: lead.priority ?? "medium",
    source: lead.source ?? "manual",
    opportunityScore: lead.opportunity_score ?? 0,
    qualificationStatus: lead.qualification_status ?? "unqualified",
    firstContactedAt: lead.first_contacted_at ?? null,
    lastContactedAt: lead.last_contacted_at ?? null,
    nextFollowUpAt: lead.next_follow_up_at ?? null,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
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
      const notFound = new Error("Lead not found.") as Error & { statusCode?: number }
      notFound.statusCode = 404
      throw notFound
    }

    throw error
  }

  const business = getBusinessRecord(data.businesses)

  return {
    id: data.id,
    name: business?.name ?? "",
    industry: business?.industry ?? "",
    location: business?.location ?? "",
    status: data.status,
    priority: data.priority ?? "medium",
    source: data.source ?? "manual",
    opportunityScore: data.opportunity_score ?? 0,
    qualificationStatus: data.qualification_status ?? "unqualified",
    firstContactedAt: data.first_contacted_at ?? null,
    lastContactedAt: data.last_contacted_at ?? null,
    nextFollowUpAt: data.next_follow_up_at ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}
