import { useEffect, useState } from "react"

import { Badge, Button, EmptyState, Icon } from "@/components/ui"

import { getAiAnalysis, getLeadAudit, getOpportunityScore } from "@/services/api"

import {
  LEAD_STATUSES,
  type AiAnalysisRecord,
  type DigitalAudit,
  type OpportunityScoreResult,
} from "@/types"

import { useSessionLeads } from "../hooks/useSessionLeads"

import { AddLeadForm } from "./AddLeadForm"

export function LeadPage() {
  const sessionLeads = useSessionLeads()

  const [view, setView] = useState<"table" | "kanban">("table")

  const [adding, setAdding] = useState(false)

  const [auditSummary, setAuditSummary] = useState<DigitalAudit | null>(null)

  const [opportunityScore, setOpportunityScore] =
    useState<OpportunityScoreResult | null>(null)

  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisRecord | null>(null)

  const {
    filteredLeads,
    currentPage: page,
    totalPages,
    visibleLeads,
  } = sessionLeads

  useEffect(() => {
    const lead = visibleLeads[0]

    if (!lead) {
      setAuditSummary(null)
      setOpportunityScore(null)
      setAiAnalysis(null)
      return
    }

    void (async () => {
      try {
        const [audit, score, analysis] = await Promise.all([
          getLeadAudit(lead.id).catch(() => null),
          getOpportunityScore(lead.id).catch(() => null),
          getAiAnalysis(lead.id).catch(() => null),
        ])

        setAuditSummary(audit)
        setOpportunityScore(score)
        setAiAnalysis(analysis)
      } catch {
        setAuditSummary(null)
        setOpportunityScore(null)
        setAiAnalysis(null)
      }
    })()
  }, [visibleLeads])

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
      {adding && (
        <AddLeadForm
          onAdd={async (input) => {
            await sessionLeads.addLead(input)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {auditSummary || opportunityScore ? (
        <section className="panel mb-4 p-4">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div>
              <p className="eyebrow">DETERMINISTIC DIGITAL AUDIT</p>
              <h2 className="text-xl font-semibold text-white">Lead score summary</h2>
            </div>
            {opportunityScore && (
              <div className="rounded border border-[#303030] bg-[#111111] p-3 text-left">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#a5a5a5]">
                  Score
                </div>
                <div className="mt-1 text-2xl font-semibold text-white">
                  {opportunityScore.score}
                </div>
                <div className="text-xs text-[#cfcfcf]">
                  {opportunityScore.classification} · v{opportunityScore.rulesetVersion}
                </div>
              </div>
            )}
          </div>
          {auditSummary && (
            <div className="grid gap-2 md:grid-cols-2">
              {auditSummary.factors.slice(0, 6).map((factor) => (
                <div
                  key={factor.key}
                  className="flex items-center justify-between rounded border border-[#222] bg-[#111111] px-3 py-2 text-sm"
                >
                  <span className="text-[#d4d4d4]">{factor.key}</span>
                  <span className="text-[#f5f5f5]">
                    {factor.value === null ? "?" : factor.value ? "✓" : "✕"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {opportunityScore && (
            <div className="mt-3 text-sm text-[#d4d4d4]">
              Contributing factors: {opportunityScore.contributingFactors.join(" • ") || "None yet"}
            </div>
          )}
        </section>
      ) : null}

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
              <span>DIGITAL PRESENCE</span>
              <span>SCORE</span>
              <span>PRIORITY</span>
              <span>STATUS</span>
              <span>LAST ACTIVITY</span>
              <span>NEXT ACTION</span>
            </div>
            {visibleLeads.map((lead) => (
              <div className="table-row" key={lead.id}>
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
                <span>Not audited</span>
                <span>—</span>
                <span>Not scored</span>
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
                <span>—</span>
                <span>Awaiting audit</span>
              </div>
            ))}
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
