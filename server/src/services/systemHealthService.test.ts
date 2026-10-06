import assert from "node:assert/strict"

import test from "node:test"

import { type ServiceHealthStatus } from "./systemHealthService.js"

test("system health reports runtime capability states without secrets", async () => {
  const { getSystemHealthStatus } = await import("./systemHealthService.js")
  const result = await getSystemHealthStatus()

  assert.ok(result.status === "healthy" || result.status === "degraded" || result.status === "error" || result.status === "unknown")
  assert.equal(typeof result.checkedAt, "string")
  assert.ok(result.services.api.status === "CONNECTED")
  assert.ok(typeof result.services.ai.status === "string")
  assert.ok(result.services.n8n.status === "NOT_CONFIGURED")

  const statuses: ServiceHealthStatus[] = [
    "CONNECTED",
    "AVAILABLE",
    "CONFIGURED",
    "NOT_CONFIGURED",
    "DEGRADED",
    "ERROR",
    "UNKNOWN",
  ]

  assert.ok(statuses.includes(result.services.api.status))
  assert.ok(statuses.includes(result.services.database.status))
  assert.ok(statuses.includes(result.services.audit.status))
})

test("missing Supabase configuration is reported without crashing the process", async () => {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY

  try {
    const { getSystemHealthStatus } = await import("./systemHealthService.js")
    const result = await getSystemHealthStatus()

    assert.equal(result.status, "error")
    assert.equal(result.services.database.status, "ERROR")
    assert.match(result.services.database.detail ?? "", /not configured/i)
  } finally {
    if (previousUrl) process.env.SUPABASE_URL = previousUrl
    if (previousKey) process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
  }
})
