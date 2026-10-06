import test from "node:test"

import assert from "node:assert/strict"

import { normalizeLeadInput } from "../utils/leadValidation.js"

import { isLeadStatus } from "../utils/leadValidation.js"

test("lead status validation accepts the canonical statuses", () => {
  assert.equal(isLeadStatus("NEW"), true)

  assert.equal(isLeadStatus("QUALIFIED"), true)

  assert.equal(isLeadStatus("UNKNOWN"), false)
})

test("lead input normalization preserves the current API contract", () => {
  assert.deepEqual(
    normalizeLeadInput({
      name: " Example Co ",
      industry: "  SaaS  ",
      location: "Cape Town",
      status: "NEW",
    }),
    {
      name: "Example Co",
      industry: "SaaS",
      location: "Cape Town",
      status: "NEW",
    },
  )
})

test("invalid create input is rejected before a database write", () => {
  assert.throws(
    () =>
      normalizeLeadInput({
        name: "   ",
        status: "NEW",
      }),
    /Business name is required\./,
  )
})
