import { useState } from "react"

import { Badge, Button, EmptyState, Icon } from "@/components/ui"

import { LEAD_STATUSES } from "@/types"

import { useSessionLeads } from "../hooks/useSessionLeads"

import { AddLeadForm } from "./AddLeadForm"

export function LeadPage() {
  const sessionLeads = useSessionLeads()

  const [view, setView] = useState<"table" | "kanban">("table")

  const [adding, setAdding] = useState(false)

  const {
    filteredLeads,
    currentPage: page,
    totalPages,
    visibleLeads,
  } = sessionLeads

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CRM / LEADS</p>
          <h1>Lead intelligence</h1>
          <p>
            Persisted records are loaded from the API. Status updates are synced to
            the backend.
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
                <Badge>{lead.status}</Badge>
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
