import assert from "node:assert/strict"
import test from "node:test"

import { buildLeadShortlist } from "./leadShortlistService.js"

test("shortlist ranks qualified and review leads by deterministic score and excludes unqualified leads", () => {
  const shortlist = buildLeadShortlist([
    {
      leadId: "low",
      businessName: "Low Priority",
      websiteUrl: "https://low.example",
      status: "NEW",
      createdAt: "2026-10-01T00:00:00.000Z",
      opportunityScore: 40,
      qualificationStatus: "UNQUALIFIED",
      classification: "LOW",
      shortlistReason: "Not enough score.",
      aiSummary: "Low signal.",
    },
    {
      leadId: "review",
      businessName: "Needs Review",
      websiteUrl: "https://review.example",
      status: "AUDITED",
      createdAt: "2026-10-02T00:00:00.000Z",
      opportunityScore: 72,
      qualificationStatus: "REVIEW_REQUIRED",
      classification: "MEDIUM",
      shortlistReason: "Strong signal but needs additional review.",
      aiSummary: "Review the contact path.",
    },
    {
      leadId: "high",
      businessName: "Top Prospect",
      websiteUrl: "https://high.example",
      status: "QUALIFIED",
      createdAt: "2026-10-03T00:00:00.000Z",
      opportunityScore: 92,
      qualificationStatus: "QUALIFIED",
      classification: "HIGH",
      shortlistReason: "Qualified and high-opportunity.",
      aiSummary: "Strong growth potential.",
    },
  ])

  assert.equal(shortlist.count, 2)
  assert.deepEqual(shortlist.recommendations.map((entry) => entry.leadId), ["high", "review"])
  assert.equal(shortlist.recommendations[0].classification, "HIGH")
  assert.equal(shortlist.recommendations[1].qualificationStatus, "REVIEW_REQUIRED")
  assert.match(shortlist.generatedAt, /^\d{4}-\d{2}-\d{2}T/)
})
