import assert from "node:assert/strict"

import test from "node:test"

import { calculateAnalyticsMetrics } from "./analyticsService.js"

test("empty lead data returns null metrics instead of misleading zeroes", () => {
  const metrics = calculateAnalyticsMetrics([])

  assert.equal(metrics.conversionRate, null)
  assert.equal(metrics.outreachSent, null)
  assert.equal(metrics.meetingsBooked, null)
  assert.equal(metrics.replyRate, null)
  assert.equal(metrics.auditCount, null)
  assert.equal(metrics.opportunityScoreCount, null)
  assert.equal(metrics.pipeline, null)
  assert.equal(metrics.leadSources, null)
})

test("records a real zero conversion and meeting count when leads exist", () => {
  const metrics = calculateAnalyticsMetrics([
    { status: "NEW", source: "manual", firstContactedAt: null },
    { status: "AUDITED", source: "manual", firstContactedAt: null },
  ])

  assert.equal(metrics.conversionRate, 0)
  assert.equal(metrics.meetingsBooked, 0)
  assert.equal(metrics.auditCount, null)
  assert.equal(metrics.outreachSent, null)
})

test("calculates lifecycle conversion, meetings, outreach, and reply rate", () => {
  const metrics = calculateAnalyticsMetrics([
    { status: "WON", source: "manual", firstContactedAt: "2026-01-01T00:00:00Z" },
    { status: "REPLIED", source: "directory", firstContactedAt: "2026-01-02T00:00:00Z" },
    { status: "MEETING", source: "manual", firstContactedAt: null },
    { status: "NEW", source: "directory", firstContactedAt: null },
  ])

  assert.equal(metrics.conversionRate, 25)
  assert.equal(metrics.outreachSent, 2)
  assert.equal(metrics.meetingsBooked, 1)
  assert.equal(metrics.replyRate, 50)
  assert.deepEqual(metrics.leadSources, [
    { source: "directory", count: 2 },
    { source: "manual", count: 2 },
  ])
})