import { useEffect, useMemo, useState } from "react"

import {
  LEAD_STATUSES,
  type CreateLeadInput,
  type Lead,
  type LeadStatus,
} from "@/types"

import { createLead, getLeads, updateLead } from "@/services/api"

export function useSessionLeads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<LeadStatus | "ALL">("ALL")
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    void loadLeads()
  }, [])

  const loadLeads = async () => {
    setLoading(true)
    setError(null)

    try {
      const nextLeads = await getLeads()
      setLeads(nextLeads)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load leads.",
      )
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  const addLead = async (input: CreateLeadInput) => {
    try {
      const nextLead = await createLead(input)
      setLeads((current) => [nextLead, ...current])
      setError(null)
      return nextLead
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create lead.",
      )
      throw requestError
    }
  }

  const updateStatus = async (id: string, nextStatus: LeadStatus) => {
    try {
      const updatedLead = await updateLead(id, { status: nextStatus })
      setLeads((current) =>
        current.map((lead) => (lead.id === id ? updatedLead : lead)),
      )
      setError(null)
      return updatedLead
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update lead status.",
      )
      throw requestError
    }
  }

  const filteredLeads = useMemo(
    () =>
      leads.filter((lead) => {
        const fields =
          `${lead.name} ${lead.industry} ${lead.location}`.toLowerCase()

        return (
          fields.includes(query.toLowerCase()) &&
          (status === "ALL" || lead.status === status)
        )
      }),
    [leads, query, status],
  )

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize))
  const page = Math.min(currentPage, totalPages)
  const visibleLeads = filteredLeads.slice(
    (page - 1) * pageSize,
    page * pageSize,
  )

  const resetPage = () => setCurrentPage(1)

  return {
    leads,
    loading,
    error,
    query,
    setQuery: (nextQuery: string) => {
      setQuery(nextQuery)
      resetPage()
    },
    status,
    setStatus: (nextStatus: LeadStatus | "ALL") => {
      setStatus(nextStatus)
      resetPage()
    },
    currentPage: page,
    setCurrentPage,
    totalPages,
    visibleLeads,
    filteredLeads,
    addLead,
    updateStatus,
    pageSize,
    refresh: loadLeads,
  }
}

export const leadStatusOptions = ["ALL", ...LEAD_STATUSES] as const
