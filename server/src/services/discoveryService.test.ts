import assert from "node:assert/strict"

import test from "node:test"

import { runDiscovery } from "./discoveryService.js"

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
