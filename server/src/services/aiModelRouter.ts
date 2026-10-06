export type AiCapability = "structuredOutput" | "businessAnalysis"

export type AiModelConfig = {
  id: string
  model: string
  provider: "openrouter"
  priority: number
  enabled: boolean
  capabilities: {
    structuredOutput: boolean
    businessAnalysis: boolean
  }
  temperature?: number
  maxTokens?: number
}

export type AiRoutingMetadata = {
  requestedModel: string
  selectedModel: string
  provider: string
  fallbackUsed: boolean
  attemptCount: number
  failureReason?: string
}

export type RouteAttemptResult<T> = {
  result: T
  selectedModel: AiModelConfig
  metadata: AiRoutingMetadata
}

const DEFAULT_MODELS: AiModelConfig[] = [
  {
    id: "primary-business-analysis",
    model: "openai/gpt-4o-mini",
    provider: "openrouter",
    priority: 1,
    enabled: true,
    capabilities: {
      structuredOutput: true,
      businessAnalysis: true,
    },
    temperature: 0.2,
    maxTokens: 600,
  },
  {
    id: "secondary-business-analysis",
    model: "google/gemini-2.0-flash-exp",
    provider: "openrouter",
    priority: 2,
    enabled: true,
    capabilities: {
      structuredOutput: true,
      businessAnalysis: true,
    },
    temperature: 0.2,
    maxTokens: 600,
  },
  {
    id: "tertiary-business-analysis",
    model: "anthropic/claude-3.5-sonnet",
    provider: "openrouter",
    priority: 3,
    enabled: true,
    capabilities: {
      structuredOutput: true,
      businessAnalysis: true,
    },
    temperature: 0.2,
    maxTokens: 600,
  },
]

export function parseAiModels(raw?: string): AiModelConfig[] {
  if (!raw || !raw.trim()) return DEFAULT_MODELS

  try {
    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return DEFAULT_MODELS
    }

    return parsed.map((entry, index) => {
      const model = typeof entry === "object" && entry ? entry : {}

      return {
        id: "id" in model && typeof model.id === "string" ? model.id : `model-${index + 1}`,
        model:
          "model" in model && typeof model.model === "string"
            ? model.model
            : "openai/gpt-4o-mini",
        provider:
          "provider" in model && model.provider === "openrouter"
            ? "openrouter"
            : "openrouter",
        priority:
          "priority" in model && typeof model.priority === "number"
            ? model.priority
            : index + 1,
        enabled:
          !("enabled" in model) || typeof model.enabled !== "boolean"
            ? true
            : model.enabled,
        capabilities: {
          structuredOutput:
            "capabilities" in model &&
            typeof model.capabilities === "object" &&
            model.capabilities !== null &&
            "structuredOutput" in model.capabilities
              ? Boolean((model.capabilities as { structuredOutput?: unknown }).structuredOutput)
              : true,
          businessAnalysis:
            "capabilities" in model &&
            typeof model.capabilities === "object" &&
            model.capabilities !== null &&
            "businessAnalysis" in model.capabilities
              ? Boolean((model.capabilities as { businessAnalysis?: unknown }).businessAnalysis)
              : true,
        },
        temperature:
          "temperature" in model && typeof model.temperature === "number"
            ? model.temperature
            : 0.2,
        maxTokens:
          "maxTokens" in model && typeof model.maxTokens === "number"
            ? model.maxTokens
            : 600,
      }
    })
  } catch {
    return DEFAULT_MODELS
  }
}

export function getAiModels(): AiModelConfig[] {
  return parseAiModels(process.env.AI_MODELS)
}

export function getEligibleModels(
  requiredCapabilities: Partial<Record<AiCapability, boolean>> = {
    structuredOutput: true,
    businessAnalysis: true,
  },
): AiModelConfig[] {
  return getAiModels()
    .filter((config) => config.enabled)
    .filter((config) =>
      Object.entries(requiredCapabilities).every(([capability, required]) => {
        if (!required) return true
        const key = capability as AiCapability
        return Boolean(config.capabilities[key])
      }),
    )
    .sort((left, right) => left.priority - right.priority)
}

export function shouldRetryModelFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false

  const message = "message" in error ? String(error.message) : ""
  const code = "code" in error ? String(error.code) : ""
  const status = "statusCode" in error ? Number(error.statusCode ?? 0) : 0

  if ([401, 403].includes(status)) return false
  if ([400].includes(status)) return false

  const retryablePatterns = [
    "429",
    "rate limit",
    "quota",
    "credit",
    "temporary",
    "unavailable",
    "timeout",
    "too many requests",
  ]

  return retryablePatterns.some((pattern) =>
    message.toLowerCase().includes(pattern) || code.toLowerCase().includes(pattern),
  )
}

export async function runWithModelFallback<T>(
  requiredCapabilities: Partial<Record<AiCapability, boolean>>,
  executor: (model: AiModelConfig) => Promise<T>,
  maxAttempts = 3,
): Promise<RouteAttemptResult<T>> {
  const eligibleModels = getEligibleModels(requiredCapabilities).slice(0, Math.max(1, maxAttempts))

  if (eligibleModels.length === 0) {
    throw new Error("No enabled AI models are available for the requested capability set.")
  }

  let lastError: unknown = null

  for (let index = 0; index < eligibleModels.length; index += 1) {
    const model = eligibleModels[index]

    try {
      const result = await executor(model)

      return {
        result,
        selectedModel: model,
        metadata: {
          requestedModel: model.model,
          selectedModel: model.model,
          provider: model.provider,
          fallbackUsed: index > 0,
          attemptCount: index + 1,
        },
      }
    } catch (error) {
      lastError = error

      if (index === eligibleModels.length - 1 || !shouldRetryModelFailure(error)) {
        const message = error instanceof Error ? error.message : "AI model request failed."
        const failureReason = message

        throw Object.assign(new Error(message), {
          code: "AI_MODEL_FAILURE",
          statusCode: 502,
          failureReason,
        })
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AI model routing failed without a usable error.")
}
