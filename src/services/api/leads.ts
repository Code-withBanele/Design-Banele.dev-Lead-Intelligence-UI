import { fetchJson } from "./client"

import type { CreateLeadInput, Lead, UpdateLeadInput } from "@/types"

export async function getLeads(): Promise<Lead[]> {
  return fetchJson<Lead[]>(`/leads`)
}

export async function getLead(id: string): Promise<Lead> {
  return fetchJson<Lead>(`/leads/${id}`)
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  return fetchJson<Lead>(`/leads`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
): Promise<Lead> {
  return fetchJson<Lead>(`/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}
