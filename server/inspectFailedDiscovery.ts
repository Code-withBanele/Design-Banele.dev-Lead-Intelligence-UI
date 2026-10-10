import { supabase } from "./src/db/supabase.js"

const { data: runs, error: runError } = await supabase
  .from("discovery_runs")
  .select("id, source_url, source_type, confidence, status, started_at, completed_at, pages_visited, requests_made, businesses_discovered, businesses_created, businesses_updated, leads_created, leads_updated, duplicates_skipped, reasons, result, errors, warnings")
  .order("started_at", { ascending: false })
  .limit(5)

if (runError) {
  console.log(JSON.stringify({ runQueryError: runError.message }))
} else {
  const summaries = []
  for (const run of runs ?? []) {
    const { data: links, error: linkError } = await supabase
      .from("business_source_links")
      .select("business_id, source_page_url, identity_key")
      .eq("discovery_run_id", run.id)
    const businessIds = [...new Set((links ?? []).map((link) => link.business_id))]
    const { data: businesses, error: businessError } = businessIds.length
      ? await supabase.from("businesses").select("id, name, website_url, phone, address").in("id", businessIds)
      : { data: [], error: null }
    const { data: leads, error: leadError } = businessIds.length
      ? await supabase.from("leads").select("id, business_id, status, opportunity_score, source").in("business_id", businessIds)
      : { data: [], error: null }
    const names = new Map<string, number>()
    for (const business of businesses ?? []) names.set(business.name, (names.get(business.name) ?? 0) + 1)
    const duplicateNames = [...names.entries()].filter(([, count]) => count > 1)
    const businessLeadCounts = new Map<string, number>()
    for (const lead of leads ?? []) businessLeadCounts.set(lead.business_id, (businessLeadCounts.get(lead.business_id) ?? 0) + 1)
    summaries.push({
      run: {
        id: run.id,
        sourceUrl: run.source_url,
        status: run.status,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        sourceType: run.source_type,
        confidence: run.confidence,
        pagesVisited: run.pages_visited,
        requestsMade: run.requests_made,
        businessesDiscovered: run.businesses_discovered,
        businessesCreated: run.businesses_created,
        businessesUpdated: run.businesses_updated,
        leadsCreated: run.leads_created,
        leadsUpdated: run.leads_updated,
        duplicatesSkipped: run.duplicates_skipped,
        reasons: run.reasons,
        resultBusinessCount: Array.isArray(run.result?.businesses) ? run.result.businesses.length : null,
        errors: run.errors,
        warnings: run.warnings,
      },
      linkedBusinessCount: businessIds.length,
      businesses: (businesses ?? []).map((business) => ({ id: business.id, name: business.name, websiteUrl: business.website_url })),
      linkedLeadCount: leads?.length ?? 0,
      businessesWithMultipleLeads: [...businessLeadCounts.entries()].filter(([, count]) => count > 1).length,
      duplicateNames,
      opportunityScoreNullLeads: (leads ?? []).filter((lead) => lead.opportunity_score === null).length,
      duplicateBusinessDetails: (businesses ?? []).filter((business) => names.get(business.name)! > 1).map((business) => ({
        id: business.id,
        name: business.name,
        phone: business.phone,
        address: business.address,
        sourcePages: (links ?? []).filter((link) => link.business_id === business.id).map((link) => link.source_page_url),
      })),
      queryErrors: [linkError?.message, businessError?.message, leadError?.message].filter(Boolean),
    })
  }
  console.log(JSON.stringify(summaries, null, 2))
}
