import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export type HostResolver = (hostname: string) => Promise<Array<{ address: string }>>
export type RequestBudget = { count: number; limit: number }

export type SafeHttpOptions = {
  timeoutMs: number
  maxRedirects: number
  maxResponseSize: number
}

export const SAFE_HTTP_CONFIG = {
  timeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 10000),
  maxRedirects: Number(process.env.MAX_REDIRECTS ?? 5),
  maxResponseSize: Number(process.env.MAX_RESPONSE_SIZE ?? 1200000),
}

const resolveHostname: HostResolver = (hostname) =>
  lookup(hostname, { all: true, verbatim: true })

function expandIpv6(host: string): string | null {
  if (host.includes("%")) return null
  const halves = host.split("::")
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(":") : []
  const right = halves[1] ? halves[1].split(":") : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [...left, ...Array(missing).fill("0"), ...right]
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null
  return groups.map((group) => Number.parseInt(group, 16).toString(16).padStart(4, "0")).join(":")
}

function isPrivateIp(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  const family = isIP(host)

  if (family === 4) {
    const [first, second, third] = host.split(".").map(Number)
    return (
      first === 0 || first === 10 || first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0 && (third === 0 || third === 2)) ||
      (first === 198 && (second === 18 || second === 19 || second === 51 && third === 100)) ||
      (first === 203 && second === 0 && third === 113) || first >= 224
    )
  }

  if (family !== 6) return false
  const expanded = expandIpv6(host)
  if (!expanded) return true
  const groups = expanded.split(":").map((group) => Number.parseInt(group, 16))
  const mappedIpv4Prefix = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  if (mappedIpv4Prefix || groups.slice(0, 6).every((group) => group === 0)) {
    const mappedIpv4 = `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
    return isPrivateIp(mappedIpv4) || groups[6] === 0 && groups[7] <= 1
  }
  return (groups[0] & 0xfe00) === 0xfc00 ||
    (groups[0] & 0xffc0) === 0xfe80 ||
    (groups[0] & 0xffc0) === 0xfec0
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().trim().replace(/\.$/, "")
  if (!host) return true
  if (host === "localhost" || host.endsWith(".localhost") || host === "localhost.localdomain") return true
  if ([".localdomain", ".local", ".internal", ".lan", ".home.arpa"].some((suffix) => host.endsWith(suffix))) return true
  return isPrivateIp(host)
}

export function validateSafeUrl(rawUrl: string): string {
  const value = (rawUrl ?? "").trim()
  if (!value) throw new Error("A source URL is required.")

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("The source URL is invalid.")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https source URLs are supported.")
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("The source URL resolves to a blocked internal or local address.")
  }
  return url.toString().replace(/\/$/, "")
}

export async function validateResolvedSafeUrl(
  rawUrl: string,
  resolver: HostResolver = resolveHostname,
): Promise<string> {
  const validatedUrl = validateSafeUrl(rawUrl)
  const hostname = new URL(validatedUrl).hostname.replace(/^\[|\]$/g, "")
  if (isIP(hostname)) return validatedUrl

  let addresses: Array<{ address: string }>
  try {
    addresses = await resolver(hostname)
  } catch {
    throw new Error("The source hostname could not be safely resolved.")
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("The source hostname resolves to a blocked local or private network address.")
  }
  return validatedUrl
}

export async function fetchSafeResource(
  rawUrl: string,
  options: SafeHttpOptions,
  requestBudget: RequestBudget,
  resolver: HostResolver = resolveHostname,
) {
  let currentUrl = await validateResolvedSafeUrl(rawUrl, resolver)
  const history: string[] = []

  for (let redirectRound = 0; redirectRound <= options.maxRedirects; redirectRound += 1) {
    if (requestBudget.count >= requestBudget.limit) throw new Error("The collection request limit was reached.")
    requestBudget.count += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
          "User-Agent": "Banele.dev Lead Intelligence Collector/1.0",
        },
      })
      const location = response.headers.get("location")
      if (response.status >= 300 && response.status < 400 && location) {
        history.push(currentUrl)
        currentUrl = await validateResolvedSafeUrl(new URL(location, currentUrl).toString(), resolver)
        continue
      }

      let body = ""
      if (response.body) {
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        let ended = false
        while (size < options.maxResponseSize) {
          const { done, value } = await reader.read()
          if (done) {
            ended = true
            break
          }
          const chunk = value.subarray(0, options.maxResponseSize - size)
          chunks.push(chunk)
          size += chunk.byteLength
          if (chunk.byteLength !== value.byteLength) {
            await reader.cancel()
            ended = true
            break
          }
        }
        if (!ended) await reader.cancel()
        body = Buffer.concat(chunks).toString("utf8")
      } else {
        body = (await response.text()).slice(0, options.maxResponseSize)
      }

      return {
        status: response.status,
        ok: response.ok,
        finalUrl: currentUrl,
        history,
        contentType: response.headers.get("content-type") ?? "",
        body,
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out for ${currentUrl}.`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error(`Too many redirects while loading ${rawUrl}.`)
}
