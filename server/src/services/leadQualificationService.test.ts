import assert from "node:assert/strict"

import test from "node:test"

import { buildAuditFactor, getDefaultAuditFactors } from "./digitalAuditService.js"
import { calculateLeadQualification } from "./leadQualificationService.js"

test("qualification requires score, sufficient evidence, and a known contact method", () => {
  const factors = getDefaultAuditFactors().map((factor) =>
    buildAuditFactor(factor.key, factor.key === "hasContactMethod" ? true : true),
  )

  const result = calculateLeadQualification(
    { score: 80, classification: "HIGH" },
    factors,
    5,
    new Date("2026-10-06T12:00:00.000Z"),
  )

  assert.equal(result.status, "QUALIFIED")
  assert.equal(result.evidenceSufficiency, "SUFFICIENT")
  assert.equal(result.evaluatedAt, "2026-10-06T12:00:00.000Z")
  assert.equal(result.blockingFactors.length, 0)
})

test("partial evidence requires review without treating unknown audit data as negative", () => {
  const factors = getDefaultAuditFactors()

  const result = calculateLeadQualification(
    { score: 55, classification: "MEDIUM" },
    factors,
    0,
  )

  assert.equal(result.status, "REVIEW_REQUIRED")
  assert.equal(result.evidenceSufficiency, "INSUFFICIENT")
  assert.ok(result.blockingFactors.some((factor) => /evidence/i.test(factor)))
  assert.ok(result.blockingFactors.some((factor) => /contact/i.test(factor)))
})

test("low deterministic scores are unqualified and retain a reason", () => {
  const factors = getDefaultAuditFactors().map((factor) =>
    buildAuditFactor(factor.key, factor.key === "hasContactMethod" ? false : true),
  )
  const result = calculateLeadQualification(
    { score: 20, classification: "LOW" },
    factors,
    8,
  )

  assert.equal(result.status, "UNQUALIFIED")
  assert.ok(result.blockingFactors.some((factor) => /score/i.test(factor)))
})

test("low scores with incomplete evidence require review rather than rejection", () => {
  const result = calculateLeadQualification(
    { score: 20, classification: "LOW" },
    getDefaultAuditFactors(),
    0,
  )

  assert.equal(result.status, "REVIEW_REQUIRED")
})