type RobotsRule = { allow: boolean; pattern: string }
type RobotsGroup = { agents: string[]; rules: RobotsRule[] }

function patternMatches(path: string, pattern: string): boolean {
  const endAnchored = pattern.endsWith("$")
  const source = pattern.replace(/\$$/, "").split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")
  return new RegExp(`^${source}${endAnchored ? "$" : ""}`).test(path)
}

export function isDiscoveryPathAllowedByRobots(
  targetUrl: string,
  robotsText: string,
  userAgent = "Banele.dev Lead Intelligence Collector",
): boolean {
  const groups: RobotsGroup[] = []
  let group: RobotsGroup | null = null
  let hasRules = false

  for (const line of robotsText.split(/\r?\n/)) {
    const directive = line.split("#", 1)[0].trim()
    const separator = directive.indexOf(":")
    if (separator < 0) continue
    const key = directive.slice(0, separator).trim().toLowerCase()
    const value = directive.slice(separator + 1).trim()

    if (key === "user-agent") {
      if (!group || hasRules) {
        group = { agents: [], rules: [] }
        groups.push(group)
        hasRules = false
      }
      group.agents.push(value.toLowerCase())
      continue
    }

    if ((key === "allow" || key === "disallow") && value) {
      if (!group) continue
      group.rules.push({ allow: key === "allow", pattern: value })
      hasRules = true
    }
  }

  const agent = userAgent.toLowerCase()
  const matchingGroups = groups.filter((candidate) => candidate.agents.some((name) =>
    name === "*" || name.length > 0 && agent.includes(name),
  ))
  const specific = matchingGroups.filter((candidate) => candidate.agents.some((name) => name !== "*" && agent.includes(name)))
  const applicable = specific.length ? specific : matchingGroups.filter((candidate) => candidate.agents.includes("*"))
  const rules = applicable.flatMap((candidate) => candidate.rules)
  if (!rules.length) return true

  const url = new URL(targetUrl)
  const path = `${url.pathname}${url.search}`
  const matches = rules
    .filter((rule) => patternMatches(path, rule.pattern))
    .sort((left, right) => {
      const specificity = right.pattern.replace(/[\*$]/g, "").length - left.pattern.replace(/[\*$]/g, "").length
      return specificity || Number(right.allow) - Number(left.allow)
    })
  if (!matches.length) return true
  return matches[0].allow
}
