import assert from "node:assert/strict"

import test from "node:test"

import {
  type ServiceHealthStatus,
  getSystemHealthStatus,
} from "./systemHealthService.js"

test("system health reports runtime capability states without secrets", async () => {
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
