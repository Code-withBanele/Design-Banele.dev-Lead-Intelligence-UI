import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Badge, Button, EmptyState, Icon } from "@/components/ui"

import {
  collectDigitalIntelligence,
  evaluateLeadQualification,
  getAiAnalysis,
  getDigitalIntelligence,
  getLeadAudit,
  getLeadQualification,
  getLeadPipelineStatus,
  getOpportunityScore,
  rerunLeadPipeline,
} from "@/services/api"

import {
  LEAD_STATUSES,
  type AiAnalysisRecord,
  type DigitalAudit,
  type DigitalIntelligenceResult,
  type DigitalIntelligenceRun,
  type LeadQualificationResult,
  type OpportunityScoreResult,
  type LeadPipelineStatus,
} from "@/types"

import { useSessionLeads } from "../hooks/useSessionLeads"

import { AddLeadForm } from "./AddLeadForm"

const auditFactorLabels: Record<string, string> = {
  hasWebsite: "Website",
  hasGoogleBusinessProfile: "Google Business Profile",
  hasActiveSocial: "Active Social",
  hasOnlineOrdering: "Online Ordering",
  hasOnlineBooking: "Online Booking",
  hasWhatsApp: "WhatsApp",
  hasContactMethod: "Contact Method",
  hasMobileFriendlyWebsite: "Mobile Friendly Website",
  hasStrongCTA: "Strong CTA",
  hasBasicSEO: "Basic SEO",
  hasVisibleBusinessInformation: "Visible Business Information",
}

function formatAuditFactor(key: string) {
  return auditFactorLabels[key] ?? key
}

export function LeadPage() {
  const navigate = useNavigate()
  const sessionLeads = useSessionLeads()

  const [view, setView] = useState<"table" | "kanban">("table")

  const [adding, setAdding] = useState(false)

  const [auditSummary, setAuditSummary] = useState<DigitalAudit | null>(null)

  const [opportunityScore, setOpportunityScore] =
    useState<OpportunityScoreResult | null>(null)

  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisRecord | null>(null)

  const [digitalIntelligence, setDigitalIntelligence] =
    useState<DigitalIntelligenceRun | DigitalIntelligenceResult | null>(null)

  const [qualification, setQualification] =
    useState<LeadQualificationResult | null>(null)

  const [evaluatingQualification, setEvaluatingQualification] = useState(false)

  const [qualificationError, setQualificationError] = useState<string | null>(null)

  const [creatingAudit, setCreatingAudit] = useState(false)

  const [auditActionError, setAuditActionError] = useState<string | null>(null)

  const [auditActionSuccess, setAuditActionSuccess] = useState<string | null>(null)

  const [auditTargetMode, setAuditTargetMode] = useState<"existing" | "new">("existing")

  const [selectedLeadIdState, setSelectedLeadIdState] = useState<string | null>(null)

  const [newBusinessName, setNewBusinessName] = useState("")

  const [newBusinessWebsite, setNewBusinessWebsite] = useState("")

  const [pipelineByLead, setPipelineByLead] = useState<Record<string, LeadPipelineStatus>>({})

  const [pipelineLoadErrors, setPipelineLoadErrors] = useState<Record<string, string>>({})

  const [retryingPipelineFor, setRetryingPipelineFor] = useState<string | null>(null)

  const [pipelineActionError, setPipelineActionError] = useState<string | null>(null)

  const [websiteUrl, setWebsiteUrl] = useState("")

  const [collectingDigital, setCollectingDigital] = useState(false)

  const [digitalCollectionError, setDigitalCollectionError] = useState<string | null>(null)

  const {
    filteredLeads,
    currentPage: page,
    totalPages,
    visibleLeads,
  } = sessionLeads

  const selectedLead = visibleLeads.find((lead) => lead.id === selectedLeadIdState) ?? visibleLeads[0] ?? null
  const selectedLeadId = selectedLead?.id
  const visibleLeadIds = visibleLeads.map((lead) => lead.id).join(",")

  const handleCreateAudit = async () => {
    if (auditTargetMode === "new") {
      const businessName = newBusinessName.trim()
      const businessWebsite = newBusinessWebsite.trim()

      if (!businessName) {
        setAuditActionError("Enter a business name before creating an audit for a new business.")
        return
      }
      if (!businessWebsite) {
        setAuditActionError("Add a valid public website URL to create an audit for the new business.")
        return
      }

      try {
        setCreatingAudit(true)
        setAuditActionError(null)
        setAuditActionSuccess(null)

        const createdLead = await sessionLeads.addLead({
          name: businessName,
          websiteUrl: businessWebsite,
          status: "NEW",
        })

        const result = await collectDigitalIntelligence(createdLead.id, {
          website: businessWebsite,
        })

        try {
          await rerunLeadPipeline(createdLead.id)
        } catch {
          // The audit result is still stored; pipeline retry can be manual if the queue is unavailable.
        }

        setNewBusinessName("")
        setNewBusinessWebsite("")
        setWebsiteUrl(businessWebsite)
        setDigitalIntelligence(result)
        setAuditSummary(result.audit as DigitalAudit)
        setOpportunityScore(result.score as OpportunityScoreResult)
        setAuditActionSuccess("Audit created for the new business.")
      } catch (error) {
        setAuditActionError(
          error instanceof Error ? error.message : "Unable to create the audit for the new business.",
        )
      } finally {
        setCreatingAudit(false)
      }

      return
    }

    if (!selectedLead) return

    const leadWebsite = (selectedLead.websiteUrl ?? websiteUrl).trim()
    if (!selectedLead.name.trim()) {
      setAuditActionError("This lead is missing a business name, so no audit can be generated.")
      return
    }
    if (!leadWebsite) {
      setAuditActionError("This lead has no verified website to audit. Add a business website or run discovery before creating an audit.")
      return
    }

    try {
      setCreatingAudit(true)
      setAuditActionError(null)
      setAuditActionSuccess(null)

      const result = await collectDigitalIntelligence(selectedLead.id, {
        website: leadWebsite,
      })

      try {
        await rerunLeadPipeline(selectedLead.id)
      } catch {
        // The audit result is still stored; pipeline retry can be manual if the queue is unavailable.
      }

      setWebsiteUrl(leadWebsite)
      setDigitalIntelligence(result)
      setAuditSummary(result.audit as DigitalAudit)
      setOpportunityScore(result.score as OpportunityScoreResult)
      setAuditActionSuccess("Audit created and saved for this lead.")
    } catch (error) {
      setAuditActionError(
        error instanceof Error ? error.message : "Unable to create the audit for this lead.",
      )
    } finally {
      setCreatingAudit(false)
    }
  }

  useEffect(() => {
    const leadIds = visibleLeadIds ? visibleLeadIds.split(",") : []
    if (!leadIds.length) {
      setPipelineByLead({})
      return
    }

    let disposed = false
    let refreshing = false
    const refresh = async () => {
      if (refreshing) return
      refreshing = true
      const results = await Promise.all(leadIds.map(async (leadId) => {
        try {
          return [leadId, await getLeadPipelineStatus(leadId), null] as const
        } catch (error) {
          return [leadId, null, error instanceof Error ? error.message : "Unable to load pipeline status."] as const
        }
      }))
      if (!disposed) {
        setPipelineByLead((current) => Object.fromEntries(results.flatMap(([leadId, status]) => {
          const nextStatus = status ?? current[leadId]
          return nextStatus ? [[leadId, nextStatus]] : []
        })))
        setPipelineLoadErrors(Object.fromEntries(results.flatMap(([leadId, status, message]) =>
          !status && message ? [[leadId, message]] : [],
        )))
      }
      refreshing = false
    }

    void refresh()
    const intervalId = window.setInterval(() => void refresh(), 4000)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [visibleLeadIds])

  useEffect(() => {
    if (!selectedLeadId) {
      setAuditSummary(null)
      setOpportunityScore(null)
      setAiAnalysis(null)
      setDigitalIntelligence(null)
      setQualification(null)
      setWebsiteUrl("")
      return
    }

    const selectedLead = visibleLeads[0]
    setWebsiteUrl(selectedLead?.websiteUrl ?? "")
    setQualificationError(null)

    void (async () => {
      try {
        const [audit, score, analysis, intelligence, latestQualification] = await Promise.all([
          getLeadAudit(selectedLeadId).catch(() => null),
          getOpportunityScore(selectedLeadId).catch(() => null),
          getAiAnalysis(selectedLeadId).catch(() => null),
          getDigitalIntelligence(selectedLeadId).catch(() => null),
          getLeadQualification(selectedLeadId).catch((error) => {
            setQualificationError(
              error instanceof Error
                ? error.message
                : "Unable to load lead qualification.",
            )
            return null
          }),
        ])

        setAuditSummary(audit)
        setOpportunityScore(score)
        setAiAnalysis(analysis)
        setDigitalIntelligence(intelligence)
        setQualification(latestQualification)
      } catch {
        setAuditSummary(null)
        setOpportunityScore(null)
        setAiAnalysis(null)
        setDigitalIntelligence(null)
        setQualification(null)
      }
    })()
  }, [selectedLeadId])

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CRM / LEADS</p>
          <h1>Lead intelligence</h1>
          <p>
            Persisted records are loaded from the API. Status updates are synced
            to the backend.
          </p>
        </div>
        <Button icon="plus" onClick={() => setAdding(true)}>
          Add lead
        </Button>
      </div>
      {sessionLeads.error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {sessionLeads.error}
        </div>
      )}
      {pipelineActionError && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {pipelineActionError}
        </div>
      )}
      {adding && (
        <AddLeadForm
          onAdd={async (input) => {
            const lead = await sessionLeads.addLead(input)
            if (input.websiteUrl?.trim()) {
              try {
                await collectDigitalIntelligence(lead.id, {
                  website: input.websiteUrl.trim(),
                })
                setAuditActionSuccess("Lead created and audited from the provided website.")
              } catch (error) {
                setAuditActionError(
                  error instanceof Error ? error.message : "The lead was created, but the audit could not be generated.",
                )
              }
            }
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {selectedLead && !auditSummary && !opportunityScore && (
        <section className="panel mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div>
              <p className="eyebrow">DIGITAL AUDIT</p>
              <h2 className="text-xl font-semibold text-white">No audit created yet</h2>
            </div>
            <button
              type="button"
              className="rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={creatingAudit || (auditTargetMode === "existing" && !selectedLead.websiteUrl && !websiteUrl.trim()) || (auditTargetMode === "new" && !newBusinessName.trim() && !newBusinessWebsite.trim())}
              onClick={() => void handleCreateAudit()}
            >
              {creatingAudit ? "Creating audit..." : "Create Audit"}
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded border px-3 py-2 text-sm font-medium ${auditTargetMode === "existing" ? "border-emerald-500 bg-emerald-500/10 text-emerald-200" : "border-[#303030] bg-[#111111] text-white"}`}
              onClick={() => setAuditTargetMode("existing")}
            >
              Use existing business
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-2 text-sm font-medium ${auditTargetMode === "new" ? "border-emerald-500 bg-emerald-500/10 text-emerald-200" : "border-[#303030] bg-[#111111] text-white"}`}
              onClick={() => setAuditTargetMode("new")}
            >
              Create audit for new business
            </button>
          </div>

          {auditTargetMode === "new" && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-[#a5a5a5]">
                Business name
                <input
                  value={newBusinessName}
                  onChange={(event) => setNewBusinessName(event.target.value)}
                  className="rounded border border-[#303030] bg-[#101010] px-3 py-2 text-sm text-white placeholder:text-[#6b7280]"
                  placeholder="Example Co"
                />
              </label>
              <label className="grid gap-1 text-xs text-[#a5a5a5]">
                Website URL
                <input
                  value={newBusinessWebsite}
                  onChange={(event) => setNewBusinessWebsite(event.target.value)}
                  className="rounded border border-[#303030] bg-[#101010] px-3 py-2 text-sm text-white placeholder:text-[#6b7280]"
                  placeholder="https://example.com"
                />
              </label>
            </div>
          )}
          {auditActionError && (
            <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {auditActionError}
            </div>
          )}
          {auditActionSuccess && (
            <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {auditActionSuccess}
            </div>
          )}
          <p className="text-sm text-[#a5a5a5]">
            Use the lead’s business website or a verified source URL to generate a deterministic digital audit and score.
          </p>
        </section>
      )}

      {auditSummary || opportunityScore ? (
        <section className="panel mb-4 p-4">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div>
              <p className="eyebrow">DETERMINISTIC DIGITAL AUDIT</p>
              <h2 className="text-xl font-semibold text-white">Lead score summary</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={creatingAudit || (auditTargetMode === "existing" && (!selectedLead || (!selectedLead.websiteUrl && !websiteUrl.trim()))) || (auditTargetMode === "new" && (!newBusinessName.trim() || !newBusinessWebsite.trim()))}
                onClick={() => void handleCreateAudit()}
              >
                {creatingAudit ? "Creating audit..." : "Create Audit"}
              </button>
              {opportunityScore && (
                <div className="rounded border border-[#303030] bg-[#111111] p-3 text-left">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
                    Score
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-white">
                    {opportunityScore.score}
                  </div>
                  <div className="text-xs text-[#cfcfcf]">
                    {opportunityScore.classification} · {opportunityScore.rulesetVersion}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded border px-3 py-2 text-sm font-medium ${auditTargetMode === "existing" ? "border-emerald-500 bg-emerald-500/10 text-emerald-200" : "border-[#303030] bg-[#111111] text-white"}`}
              onClick={() => setAuditTargetMode("existing")}
            >
              Use existing business
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-2 text-sm font-medium ${auditTargetMode === "new" ? "border-emerald-500 bg-emerald-500/10 text-emerald-200" : "border-[#303030] bg-[#111111] text-white"}`}
              onClick={() => setAuditTargetMode("new")}
            >
              Create audit for new business
            </button>
          </div>

          {auditTargetMode === "new" && (
            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-[#a5a5a5]">
                Business name
                <input
                  value={newBusinessName}
                  onChange={(event) => setNewBusinessName(event.target.value)}
                  className="rounded border border-[#303030] bg-[#101010] px-3 py-2 text-sm text-white placeholder:text-[#6b7280]"
                  placeholder="Example Co"
                />
              </label>
              <label className="grid gap-1 text-xs text-[#a5a5a5]">
                Website URL
                <input
                  value={newBusinessWebsite}
                  onChange={(event) => setNewBusinessWebsite(event.target.value)}
                  className="rounded border border-[#303030] bg-[#101010] px-3 py-2 text-sm text-white placeholder:text-[#6b7280]"
                  placeholder="https://example.com"
                />
              </label>
            </div>
          )}

          {auditActionError && (
            <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {auditActionError}
            </div>
          )}
          {auditActionSuccess && (
            <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {auditActionSuccess}
            </div>
          )}
          {auditSummary && (
            <details className="mt-3 border-t border-[#303030] pt-3">
              <summary className="cursor-pointer text-sm font-medium text-white">
                Inspect all {auditSummary.factors.length} audit factors
              </summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {auditSummary.factors.map((factor) => {
                  const value = factor.value
                  const state = value === null ? "UNKNOWN" : value ? "FOUND" : "NOT FOUND"
                  const weight = opportunityScore?.factorWeights?.[factor.key]
                  return (
                    <div
                      key={factor.key}
                      className="rounded border border-[#222] bg-[#111111] px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[#d4d4d4]">{formatAuditFactor(factor.key)}</span>
                        <strong className={value === null ? "text-amber-300" : value ? "text-emerald-300" : "text-red-300"}>
                          {state}
                        </strong>
                      </div>
                      <div className="mt-1 flex justify-between gap-3 text-xs text-[#a5a5a5]">
                        <span>{weight === undefined ? "Weight unavailable" : `Weight +${weight}`}</span>
                        <span>{factor.status}</span>
                      </div>
                      <p className="mt-1 break-all text-xs text-[#a5a5a5]">
                        {factor.evidence || "No evidence source recorded."}
                      </p>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-[#a5a5a5]">
                {opportunityScore
                  ? `Ruleset ${opportunityScore.rulesetVersion}; calculated ${new Date(opportunityScore.calculatedAt).toLocaleString()}.`
                  : `Audit version ${auditSummary.auditVersion}; no calculated score is available.`}
              </p>
            </details>
          )}
          {opportunityScore && (
            <div className="mt-3 text-sm text-[#d4d4d4]">
              Contributing factors: {opportunityScore.contributingFactors.join(" • ") || "None yet"}
            </div>
          )}
        </section>
      ) : null}

      {visibleLeads[0] && (
        <section className="panel mb-4 p-4">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div>
              <p className="eyebrow">DIGITAL INTELLIGENCE</p>
              <h2 className="text-xl font-semibold text-white">Evidence collector</h2>
            </div>
            <button
              type="button"
              className="rounded border border-[#303030] bg-[#111111] px-3 py-2 text-xs font-medium text-white"
              onClick={() => navigate("/discovery")}
            >
              Use directory or listing source
            </button>
            {digitalIntelligence && (
              <div className="rounded border border-[#303030] bg-[#111111] p-3 text-left">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
                  Status
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {digitalIntelligence.status}
                </div>
              </div>
            )}
          </div>
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label className="text-xs text-[#a5a5a5]" htmlFor="known-website-source">
                Known business website
              </label>
              <input
                id="known-website-source"
                aria-label="Known business website URL"
                className="w-full rounded border border-[#303030] bg-[#101010] px-3 py-2 text-sm text-white placeholder:text-[#6b7280]"
                placeholder="https://example.com"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
              />
              <span className="text-xs text-[#a5a5a5]">
                This URL is checked as this business’s website. Directory and listing URLs belong in Discovery.
              </span>
            </div>
            <button
              type="button"
              className="rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={collectingDigital || !websiteUrl.trim()}
              onClick={async () => {
                if (!visibleLeads[0]) return
                try {
                  setCollectingDigital(true)
                  setDigitalCollectionError(null)
                  const result = await collectDigitalIntelligence(visibleLeads[0].id, {
                    website: websiteUrl,
                  })
                  setDigitalIntelligence(result)
                } catch (error) {
                  setDigitalCollectionError(
                    error instanceof Error ? error.message : "Collection failed.",
                  )
                } finally {
                  setCollectingDigital(false)
                }
              }}
            >
              {collectingDigital ? "Collecting..." : "Collect evidence"}
            </button>
          </div>
          {digitalCollectionError && (
            <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {digitalCollectionError}
            </div>
          )}
          {digitalIntelligence?.warnings?.length ? (
            <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              {digitalIntelligence.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          ) : null}
          {digitalIntelligence?.errorMessages?.length ? (
            <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {digitalIntelligence.errorMessages.map((message) => <p key={message}>{message}</p>)}
            </div>
          ) : null}
          {digitalIntelligence ? (
            <div className="grid gap-3 text-sm text-[#d4d4d4] md:grid-cols-3">
              <div className="rounded border border-[#222] bg-[#111111] p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">Pages</div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {digitalIntelligence.pagesCrawled}
                </div>
              </div>
              <div className="rounded border border-[#222] bg-[#111111] p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">Evidence</div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {digitalIntelligence.evidenceCount}
                </div>
              </div>
              <div className="rounded border border-[#222] bg-[#111111] p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">Source</div>
                <div className="mt-1 text-sm text-white">
                  {digitalIntelligence.sourceUrl ?? "No source"}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#a5a5a5]">
              No evidence has been collected for this lead yet.
            </p>
          )}
        </section>
      )}

      {aiAnalysis && (
        <section className="panel mb-4 p-4">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div>
              <p className="eyebrow">AI BUSINESS ANALYSIS</p>
              <h2 className="text-xl font-semibold text-white">Interpretation</h2>
            </div>
            <div className="text-right text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
              {aiAnalysis.provider} / {aiAnalysis.model}
            </div>
          </div>
          <div className="space-y-4 text-sm text-[#d4d4d4]">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
                Summary
              </p>
              <p>{aiAnalysis.analysis.summary}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
                  Problems
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {(aiAnalysis.analysis.problems.length ? aiAnalysis.analysis.problems : ["No issues flagged."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
                  Opportunities
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {(aiAnalysis.analysis.opportunities.length ? aiAnalysis.analysis.opportunities : ["No opportunity notes available."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
                  Recommendations
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {(aiAnalysis.analysis.recommendations.length ? aiAnalysis.analysis.recommendations : ["No recommendations generated."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
                  Digital solution
                </p>
                <p>{aiAnalysis.analysis.digitalSolution || "No digital solution provided."}</p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
                Outreach angle
              </p>
              <p>{aiAnalysis.analysis.outreachAngle || "No outreach angle provided."}</p>
            </div>
          </div>
        </section>
      )}
      {sessionLeads.loading && (
        <div className="panel p-4 text-sm text-zinc-300">Loading leads…</div>
      )}
      <div className="toolbar">
        <div className="table-search">
          <Icon name="search" size={16} />
          <input
            aria-label="Search leads"
            value={sessionLeads.query}
            onChange={(event) => sessionLeads.setQuery(event.target.value)}
            placeholder="Search businesses..."
          />
        </div>
        <select
          aria-label="Filter by status"
          className="rounded border border-[#303030] bg-[#101010] p-2 text-xs text-white"
          value={sessionLeads.status}
          onChange={(event) =>
            sessionLeads.setStatus(
              event.target.value as typeof sessionLeads.status,
            )
          }
        >
          <option value="ALL">All statuses</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <div className="view-toggle">
          <button
            aria-label="Table view"
            className={view === "table" ? "selected" : ""}
            onClick={() => setView("table")}
          >
            <Icon name="audit" size={15} />
          </button>
          <button
            aria-label="Board view"
            className={view === "kanban" ? "selected" : ""}
            onClick={() => setView("kanban")}
          >
            <Icon name="dashboard" size={15} />
          </button>
        </div>
      </div>
      {view === "table" ? (
        <section className="panel table-panel">
          <div className="data-table lead-table">
            <div className="table-row table-head">
              <span>BUSINESS</span>
              <span>INDUSTRY / LOCATION</span>
              <span>PIPELINE</span>
              <span>SCORE / CLASS</span>
              <span>QUALIFICATION</span>
              <span>STATUS</span>
              <span>AI ANALYSIS</span>
              <span>NEXT ACTION</span>
            </div>
            {visibleLeads.map((lead) => {
              const pipeline = pipelineByLead[lead.id]
              const failedStage = pipeline && Object.values(pipeline.stages).find((stage) => stage.status === "FAILED")
              const skippedStage = pipeline && Object.values(pipeline.stages).find((stage) => stage.status === "SKIPPED" && stage.errorMessage)
              const reasonStage = failedStage ?? skippedStage
              const activeStage = pipeline && Object.values(pipeline.stages).find((stage) => stage.status === "RUNNING")
              const pendingStage = pipeline && Object.values(pipeline.stages).find((stage) => stage.status === "PENDING")
              const allSkipped = pipeline && Object.values(pipeline.stages).every((stage) => stage.status === "SKIPPED")
              const isSelected = selectedLead?.id === lead.id
              const pipelineLabel = failedStage
                ? `${failedStage.stage} FAILED`
                : activeStage
                  ? `${activeStage.stage} RUNNING`
                  : pendingStage
                    ? `${pendingStage.stage} PENDING`
                    : allSkipped
                      ? "NEEDS REVIEW"
                      : pipeline
                        ? "COMPLETE"
                        : pipelineLoadErrors[lead.id]
                          ? "Unavailable"
                          : "Loading…"

              return (
                <div
                  className={`table-row ${isSelected ? "ring-1 ring-emerald-500/60" : ""}`}
                  key={lead.id}
                  onClick={() => setSelectedLeadIdState(lead.id)}
                  style={{ cursor: "pointer" }}
                >
                  <span className="table-business">
                    <span className="business-avatar">
                      {lead.name.slice(0, 2).toUpperCase()}
                    </span>
                    <strong>{lead.name}</strong>
                  </span>
                  <span>
                    <strong>{lead.industry || "Not provided"}</strong>
                    <small>{lead.location || "Not provided"}</small>
                  </span>
                  <span title={reasonStage?.errorMessage ?? undefined}>
                    {pipelineLabel}
                    {pipeline && <small>{Object.values(pipeline.stages).map((stage) => `${stage.stage}: ${stage.status}`).join(" · ")}</small>}
                    {reasonStage?.errorMessage && <small className={failedStage ? "text-red-200" : "text-amber-200"}>{reasonStage.errorMessage}</small>}
                    {!pipeline && pipelineLoadErrors[lead.id] && <small>{pipelineLoadErrors[lead.id]}</small>}
                  </span>
                  <span>
                    {pipeline?.opportunityScore
                      ? <><strong>{pipeline.opportunityScore.score}</strong><small>{pipeline.opportunityScore.classification}</small></>
                      : "No score"}
                  </span>
                  <span>{pipeline?.qualification?.status.replace(/_/g, " ") ?? "Not evaluated"}</span>
                  <label className="sr-only" htmlFor={`status-${lead.id}`}>
                    Change lead status
                  </label>
                  <select
                    id={`status-${lead.id}`}
                    className="rounded border border-[#303030] bg-[#101010] p-2 text-xs text-white"
                    value={lead.status}
                    onChange={async (event) => {
                      await sessionLeads.updateStatus(
                        lead.id,
                        event.target.value as typeof lead.status,
                      )
                    }}
                  >
                    {LEAD_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <span title={pipeline?.aiAnalysis?.analysis.summary ?? undefined}>
                    {pipeline?.aiAnalysis?.analysis.summary ?? "No analysis"}
                  </span>
                  <span className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="rounded border border-[#303030] bg-[#111111] px-2 py-1 text-[11px] text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedLeadIdState(lead.id)
                      }}
                    >
                      Edit
                    </button>
                    {failedStage ? (
                      <button
                        type="button"
                        className="rounded border border-amber-500/50 px-2 py-1 text-xs text-amber-200 disabled:opacity-50"
                        disabled={retryingPipelineFor === lead.id}
                        title={failedStage.errorMessage ?? "Retry pipeline"}
                        onClick={async (event) => {
                          event.stopPropagation()
                          try {
                            setRetryingPipelineFor(lead.id)
                            setPipelineActionError(null)
                            await rerunLeadPipeline(lead.id)
                          } catch (error) {
                            setPipelineActionError(error instanceof Error ? error.message : "Unable to retry pipeline.")
                          } finally {
                            setRetryingPipelineFor(null)
                          }
                        }}
                      >
                        {retryingPipelineFor === lead.id ? "Queued…" : "Retry"}
                      </button>
                    ) : pendingStage || activeStage ? "Processing" : allSkipped ? "Needs review" : "—"}
                  </span>
                </div>
              )
            })}
          </div>
          {!sessionLeads.loading && !filteredLeads.length && (
            <EmptyState
              title={
                sessionLeads.leads.length ? "No matching leads" : "No leads yet"
              }
              text={
                sessionLeads.leads.length
                  ? "Clear your search or change the status filter."
                  : "Add a real business to get started. No demo records are loaded."
              }
            />
          )}
          <nav className="pagination" aria-label="Lead pagination">
            <span>
              Showing{" "}
              {filteredLeads.length
                ? (page - 1) * sessionLeads.pageSize + 1
                : 0}
              –{Math.min(page * sessionLeads.pageSize, filteredLeads.length)} of{" "}
              {filteredLeads.length} leads
            </span>
            <div>
              <button
                disabled={page === 1}
                onClick={() => sessionLeads.setCurrentPage(page - 1)}
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .filter(
                  (number) =>
                    number === 1 ||
                    number === totalPages ||
                    Math.abs(number - page) <= 2,
                )
                .map((number) => (
                  <button
                    key={number}
                    className={page === number ? "current" : ""}
                    aria-current={page === number ? "page" : undefined}
                    onClick={() => sessionLeads.setCurrentPage(number)}
                  >
                    {number}
                  </button>
                ))}
              <button
                disabled={page === totalPages}
                onClick={() => sessionLeads.setCurrentPage(page + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        </section>
      ) : (
        <div className="kanban">
          {LEAD_STATUSES.map((status) => (
            <section className="kanban-column" key={status}>
              <div className="kanban-head">
                <span>{status}</span>
                <b>
                  {
                    filteredLeads.filter((lead) => lead.status === status)
                      .length
                  }
                </b>
              </div>
              {filteredLeads
                .filter((lead) => lead.status === status)
                .map((lead) => (
                  <div className="kanban-card" key={lead.id}>
                    <strong>{lead.name}</strong>
                    <small>
                      {lead.industry || "Industry not provided"} ·{" "}
                      {lead.location || "Location not provided"}
                    </small>
                    <Badge>{lead.status}</Badge>
                  </div>
                ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default LeadPage
