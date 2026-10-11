import assert from "node:assert/strict"

import test from "node:test"

import { runDiscovery } from "./discoveryService.js"
import { validateSafeUrl } from "../utils/safeHttp.js"

test("discovery rejects a loopback source before creating a run", async () => {
  await assert.rejects(
    () => runDiscovery("http://127.0.0.1:3000", async () => [{ address: "127.0.0.1" }]),
    /blocked|private network/i,
  )
})

test("discovery rejects a hostname that resolves to a private address", async () => {
  await assert.rejects(
    () => runDiscovery("https://public.example", async () => [{ address: "10.0.0.8" }]),
    /private network/i,
  )
})

test("safe URLs accept a bare domain and normalize it to https", () => {
  assert.equal(validateSafeUrl("example.com"), "https://example.com")
  assert.equal(validateSafeUrl("example.com/path?q=1"), "https://example.com/path?q=1")
})
