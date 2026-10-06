import test from "node:test"
import assert from "node:assert/strict"

import { isLeadStatus, normalizeLeadInput } from "./leadValidation.js"

test("recognizes the canonical lead statuses", () => {
  assert.equal(isLeadStatus("NEW"), true)
  assert.equal(isLeadStatus("WON"), true)
  assert.equal(isLeadStatus("UNKNOWN"), false)
})

test("normalizes a new lead input from the current UI fields", () => {
  const input = normalizeLeadInput({
    name: " Example Co ",
    industry: "  SaaS  ",
    location: "Cape Town",
    status: "NEW",
  })

  assert.deepEqual(input, {
    name: "Example Co",
    industry: "SaaS",
    location: "Cape Town",
    status: "NEW",
  })
})
