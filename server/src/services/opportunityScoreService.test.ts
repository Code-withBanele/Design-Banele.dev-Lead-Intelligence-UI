import assert from "node:assert/strict"

import test from "node:test"

import {
  calculateOpportunityScore,
  OPPORTUNITY_SCORE_RULESET_VERSION,
} from "./opportunityScoreService.js"

const allPositive = {
  hasWebsite: true,
  hasGoogleBusinessProfile: true,
  hasActiveSocial: true,
  hasOnlineOrdering: true,
  hasOnlineBooking: true,
  hasWhatsApp: true,
  hasContactMethod: true,
  hasMobileFriendlyWebsite: true,
  hasStrongCTA: true,
  hasBasicSEO: true,
  hasVisibleBusinessInformation: true,
}

test("known positive factors are scored and classified as high", () => {
  const result = calculateOpportunityScore(allPositive)

  assert.equal(result.score, 113)
  assert.equal(result.classification, "HIGH")
  assert.equal(result.rulesetVersion, OPPORTUNITY_SCORE_RULESET_VERSION)
  assert.ok(result.contributingFactors.length > 0)
})

test("unknown factors do not turn into false negatives", () => {
  const result = calculateOpportunityScore({
    hasGoogleBusinessProfile: null,
    hasWebsite: null,
    hasActiveSocial: null,
    hasContactMethod: null,
  })

  assert.equal(result.score, 0)
  assert.equal(result.classification, "LOW")
  assert.equal(result.contributingFactors.includes("hasGoogleBusinessProfile unknown"), true)
})

test("Google Business Profile participates in scoring when present", () => {
  const result = calculateOpportunityScore({
    hasGoogleBusinessProfile: true,
    hasWebsite: false,
    hasActiveSocial: false,
    hasOnlineOrdering: false,
    hasOnlineBooking: false,
    hasWhatsApp: false,
    hasContactMethod: false,
    hasMobileFriendlyWebsite: false,
    hasStrongCTA: false,
    hasBasicSEO: false,
    hasVisibleBusinessInformation: false,
  })

  assert.equal(result.score, 20)
  assert.equal(result.contributingFactors.includes("hasGoogleBusinessProfile present (+20)"), true)
})

test("Google Business Profile remaining unknown is not treated as fail", () => {
  const result = calculateOpportunityScore({
    hasGoogleBusinessProfile: null,
    hasWebsite: false,
    hasActiveSocial: true,
  })

  assert.equal(result.score, 12)
  assert.equal(result.contributingFactors.includes("hasGoogleBusinessProfile unknown"), true)
})

test("score is deterministic for the same input", () => {
  const timestamp = new Date("2026-01-01T00:00:00.000Z")

  const first = calculateOpportunityScore(allPositive, timestamp)
  const second = calculateOpportunityScore(allPositive, timestamp)

  assert.deepEqual(first, second)
})
