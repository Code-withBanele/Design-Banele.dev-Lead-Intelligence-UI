import assert from "node:assert/strict"

import test from "node:test"

import { isDiscoveryPathAllowedByRobots } from "./discoveryPolicy.js"

test("robots wildcard disallow blocks source paths and permits unrelated pages", () => {
  const rules = "User-agent: *\nDisallow: /private\n"

  assert.equal(isDiscoveryPathAllowedByRobots("https://example.com/private/list", rules), false)
  assert.equal(isDiscoveryPathAllowedByRobots("https://example.com/public/list", rules), true)
})

test("more-specific Allow overrides Disallow and query paths are considered", () => {
  const rules = "User-agent: *\nDisallow: /businesses?sort=*\nAllow: /businesses?sort=public\nDisallow: /private\nAllow: /private/public\n"

  assert.equal(isDiscoveryPathAllowedByRobots("https://example.com/businesses?sort=public", rules), true)
  assert.equal(isDiscoveryPathAllowedByRobots("https://example.com/businesses?sort=private", rules), false)
  assert.equal(isDiscoveryPathAllowedByRobots("https://example.com/private/public", rules), true)
})

test("agent-specific rules take precedence over wildcard rules", () => {
  const rules = "User-agent: *\nDisallow: /\n\nUser-agent: Banele.dev Lead Intelligence Collector\nAllow: /directory\n"

  assert.equal(isDiscoveryPathAllowedByRobots("https://example.com/directory", rules), true)
})
