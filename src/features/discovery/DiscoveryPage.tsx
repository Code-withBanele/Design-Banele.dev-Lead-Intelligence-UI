import { useState } from "react"

import { Badge, SectionHeader } from "@/components/ui"
import { runDiscovery } from "@/services/api"
import type { DiscoveryRunResult } from "@/types"

export function DiscoveryPage() {
  const [sourceUrl, setSourceUrl] = useState("")
  const [result, setResult] = useState<DiscoveryRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SOURCE / DISCOVERY</p>
          <h1>Business discovery</h1>
          <p>A source URL may contain multiple businesses. Discovery records source provenance and does not run audits or outreach.</p>
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
                    </div>
                    <Badge>{business.result}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-4 text-sm text-[#a5a5a5]">No business records were extracted from this source.</p>
            )}
          </section>
          <p className="mt-4 text-xs text-[#a5a5a5]">Discovery records provenance and known website URLs only. Run Digital Intelligence separately for each business; no audits, scores, qualification decisions, or outreach are triggered here.</p>
        </>
      )}
    </div>
  )
}
