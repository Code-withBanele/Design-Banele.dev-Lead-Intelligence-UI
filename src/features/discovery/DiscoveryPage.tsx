import { useEffect, useState } from "react"

import { Badge, SectionHeader } from "@/components/ui"
import { getLeadPipelineStatus, runDiscovery } from "@/services/api"
import type { DiscoveryRunResult, LeadPipelineStatus } from "@/types"

export function DiscoveryPage() {
  const [sourceUrl, setSourceUrl] = useState("")
  const [result, setResult] = useState<DiscoveryRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [pipelineByLead, setPipelineByLead] = useState<Record<string, LeadPipelineStatus>>({})
  const [pipelineLoadErrors, setPipelineLoadErrors] = useState<Record<string, string>>({})
  const pipelineLeadIds = result?.businesses.flatMap((business) => business.leadId ? [business.leadId] : []).join(",") ?? ""

  useEffect(() => {
    const leadIds = pipelineLeadIds ? pipelineLeadIds.split(",") : []
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
    const intervalId = window.setInterval(() => void refresh(), 3000)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [pipelineLeadIds])

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SOURCE / DISCOVERY</p>
          <h1>Business discovery</h1>
          <p>A source URL may contain multiple businesses. Persisted leads enter the intelligence pipeline automatically; no outreach is performed.</p>
        </div>
        <Badge>MANUAL SOURCE</Badge>
      </div>

      <section className="panel mb-4 p-4">
        <SectionHeader title="Manual source URL" meta="BOUNDED · SAME-ORIGIN PAGINATION" />
        <form
          className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"
          onSubmit={async (event) => {
            event.preventDefault()
            setError(null)
            setResult(null)
            setRunning(true)
            try {
              setResult(await runDiscovery(sourceUrl))
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : "Discovery request failed.")
            } finally {
              setRunning(false)
            }
          }}
        >
          <label className="grid gap-1 text-xs text-[#a5a5a5]">
            Source URL
            <input
              className="w-full rounded border border-[#303030] bg-[#101010] px-3 py-2 text-sm text-white"
              type="url"
              placeholder="https://directory.example/businesses"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              required
            />
            <span>Enter a business website or a business directory/listing URL. Public HTTP(S) sources only.</span>
          </label>
          <button
            className="self-end rounded border border-[#ed1c2e] bg-[#ed1c2e] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={running || !sourceUrl.trim()}
          >
            {running ? "Discovering…" : "Run discovery"}
          </button>
        </form>
        {error && <p className="mx-4 mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      </section>

      {result && (
        <>
          <section className="panel mb-4">
            <SectionHeader title="Discovery run" meta={`${result.status} · RUN ${result.runId}`} />
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="eyebrow">SOURCE TYPE / CONFIDENCE</p><strong className="text-white">{result.sourceType.replace(/_/g, " ")} · {result.confidence}</strong></div>
              <div><p className="eyebrow">BUSINESSES</p><strong className="text-white">{result.businessesDiscovered}</strong></div>
              <div><p className="eyebrow">CREATED / UPDATED</p><strong className="text-white">{result.businessesCreated} / {result.businessesUpdated}</strong></div>
              <div><p className="eyebrow">LEADS CREATED / UPDATED</p><strong className="text-white">{result.leadsCreated} / {result.leadsUpdated}</strong></div>
              <div><p className="eyebrow">DUPLICATES / LIMITS SKIPPED</p><strong className="text-white">{result.duplicatesSkipped}</strong></div>
              <div><p className="eyebrow">PAGES / REQUESTS</p><strong className="text-white">{result.pagesVisited} / {result.requestsMade}</strong></div>
            </div>
            <div className="border-t border-[#303030] px-4 py-3 text-xs text-[#a5a5a5]">
              {result.reasons.map((reason) => <p key={reason}>{reason}</p>)}
            </div>
            <div className="break-all border-t border-[#303030] px-4 py-3 text-xs text-[#a5a5a5]">Source: {result.sourceUrl}</div>
          </section>

          {result.warnings.length > 0 && (
            <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {result.errors.map((message) => <p key={message}>{message}</p>)}
            </div>
          )}

          <section className="panel">
            <SectionHeader title="Businesses from this source" meta={`${result.businesses.length} records`} />
            {result.businesses.length ? (
              <div className="divide-y divide-[#303030]">
                {result.businesses.map((business) => (
                  <div className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]" key={`${business.businessId ?? business.name}:${business.sourcePageUrl}`}>
                    <div className="min-w-0">
                      <strong className="text-sm text-white">{business.name}</strong>
                      {(business.category || business.address || business.location || business.phone || business.email) && (
                        <p className="mt-1 break-words text-xs text-[#a5a5a5]">
                          {[business.category, business.address, business.location, business.phone, business.email].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="mt-1 break-all text-xs text-[#a5a5a5]">Source page: {business.sourcePageUrl}</p>
                      {business.website ? <p className="break-all text-xs text-[#a5a5a5]">Known business website: {business.website}</p> : <p className="text-xs text-[#a5a5a5]">Business website: UNKNOWN</p>}
                      {business.profileUrl && <p className="break-all text-xs text-[#a5a5a5]">Directory profile: {business.profileUrl}</p>}
                      {business.socialUrls.length > 0 && <p className="break-all text-xs text-[#a5a5a5]">Social profiles: {business.socialUrls.join(", ")}</p>}
                      {business.leadId && (() => {
                        const pipeline = pipelineByLead[business.leadId]
                        if (!pipeline) return <p className="mt-2 text-xs text-[#a5a5a5]">Pipeline status: {pipelineLoadErrors[business.leadId] ?? "loading…"}</p>
                        const failed = Object.values(pipeline.stages).find((stage) => stage.status === "FAILED")
                        const running = Object.values(pipeline.stages).find((stage) => stage.status === "RUNNING")
                        const pending = Object.values(pipeline.stages).find((stage) => stage.status === "PENDING")
                        const allSkipped = Object.values(pipeline.stages).every((stage) => stage.status === "SKIPPED")
                        const overall = failed
                          ? `${failed.stage} FAILED: ${failed.errorMessage ?? "Stage failed."}`
                          : running
                            ? `${running.stage} running`
                            : pending
                              ? `${pending.stage} pending`
                              : allSkipped
                                ? "Needs review"
                                : "Complete"
                        return (
                          <div className="mt-2 border-t border-[#303030] pt-2 text-xs">
                            <p className={failed ? "text-red-200" : "text-[#d4d4d4]"}>Pipeline: {overall}</p>
                            <p className="mt-1 text-[#a5a5a5]">
                              {Object.values(pipeline.stages).map((stage) => `${stage.stage}: ${stage.status}`).join(" · ")}
                            </p>
                          </div>
                        )
                      })()}
                      {!business.leadId && business.result === "FAILED" && (
                        <p className="mt-2 text-xs text-red-200">Pipeline unavailable because this lead could not be persisted.</p>
                      )}
                    </div>
                    <Badge>{business.result}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-4 text-sm text-[#a5a5a5]">No business records were extracted from this source.</p>
            )}
          </section>
          <p className="mt-4 text-xs text-[#a5a5a5]">Audits, deterministic scores, qualification, and eligible AI analysis run in the background. Outreach is not performed.</p>
        </>
      )}
    </div>
  )
}
