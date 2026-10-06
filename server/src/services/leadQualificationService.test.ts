import assert from "node:assert/strict"

import test from "node:test"

import { determineLeadQualification } from "./leadQualificationService.js"

test("high-scoring leads with verified website and contact evidence qualify", () => {
  const result = determineLeadQualification({
    score: 88,
    classification: "HIGH",
    hasWebsite: true,
    hasContactMethod: true,
    hasBusinessIdentity: true,
    hasGoogleBusinessProfile: true,
    hasStrongCTA: true,
    hasBasicSEO: true,
    hasAiInterpretation: true,
  })

  assert.equal(result.status, "qualified")
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("strong opportunity")))
})

test("medium-score leads without enough support remain in review", () => {
  const result = determineLeadQualification({
    score: 52,
    classification: "MEDIUM",
    hasWebsite: true,
    hasContactMethod: false,
    hasBusinessIdentity: true,
    hasGoogleBusinessProfile: false,
    hasStrongCTA: true,
    hasBasicSEO: false,
    hasAiInterpretation: true,
  })

  assert.equal(result.status, "needs_review")
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("needs review")))
})
