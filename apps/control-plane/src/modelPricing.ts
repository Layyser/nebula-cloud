export interface ModelTokenRates {
  /** Standard USD price per one million tokens. */
  input: number
  cachedInput: number
  output: number
}

export interface ModelUsageCostInput {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
}

export interface ModelUsageCostEstimate {
  estimatedCostMicrousd: number
  cacheSavingsMicrousd: number
}

interface PricingRule {
  matches: (provider: string, model: string) => boolean
  rates: ModelTokenRates
}

const modelIncludes = (providerNames: string[], fragments: string[]) => (
  provider: string,
  model: string,
) => providerNames.some(name => provider.includes(name))
  && fragments.some(fragment => model.includes(fragment))

// Standard API rates, expressed in USD per 1M tokens. Provider-reported cost
// remains authoritative; this table only fills gaps in usage responses.
const PRICING_RULES: PricingRule[] = [
  { matches: modelIncludes(['openai', 'codex'], ['gpt-5.6-sol']), rates: { input: 5, cachedInput: 0.5, output: 30 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-5.6-terra']), rates: { input: 2, cachedInput: 0.2, output: 12 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-5.6-luna']), rates: { input: 0.2, cachedInput: 0.02, output: 1.2 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-5.5']), rates: { input: 5, cachedInput: 0.5, output: 30 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-5.4']), rates: { input: 2.5, cachedInput: 0.25, output: 15 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-5.2']), rates: { input: 1.75, cachedInput: 0.175, output: 14 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-5.1-codex-mini']), rates: { input: 0.25, cachedInput: 0.025, output: 2 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-5.1', 'gpt-5-codex', 'gpt-5']), rates: { input: 1.25, cachedInput: 0.125, output: 10 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-4.1-mini']), rates: { input: 0.4, cachedInput: 0.1, output: 1.6 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-4.1-nano']), rates: { input: 0.1, cachedInput: 0.025, output: 0.4 } },
  { matches: modelIncludes(['openai', 'codex'], ['gpt-4.1']), rates: { input: 2, cachedInput: 0.5, output: 8 } },

  { matches: modelIncludes(['anthropic', 'claude'], ['fable-5', 'mythos-5']), rates: { input: 10, cachedInput: 1, output: 50 } },
  { matches: modelIncludes(['anthropic', 'claude'], ['opus-5', 'opus-4.8', 'opus-4.7', 'opus-4.6', 'opus-4.5']), rates: { input: 5, cachedInput: 0.5, output: 25 } },
  { matches: modelIncludes(['anthropic', 'claude'], ['sonnet-5']), rates: { input: 2, cachedInput: 0.2, output: 10 } },
  { matches: modelIncludes(['anthropic', 'claude'], ['sonnet-4.6', 'sonnet-4.5', 'sonnet-4']), rates: { input: 3, cachedInput: 0.3, output: 15 } },
  { matches: modelIncludes(['anthropic', 'claude'], ['haiku-4.5']), rates: { input: 1, cachedInput: 0.1, output: 5 } },
  { matches: modelIncludes(['anthropic', 'claude'], ['haiku-3.5']), rates: { input: 0.8, cachedInput: 0.08, output: 4 } },

  { matches: modelIncludes(['google', 'gemini'], ['gemini-3.5-flash-lite']), rates: { input: 0.3, cachedInput: 0.03, output: 2.5 } },
  { matches: modelIncludes(['google', 'gemini'], ['gemini-3.5-flash']), rates: { input: 1.5, cachedInput: 0.15, output: 9 } },
  { matches: modelIncludes(['google', 'gemini'], ['gemini-3.1-flash-lite']), rates: { input: 0.25, cachedInput: 0.025, output: 1.5 } },
  { matches: modelIncludes(['google', 'gemini'], ['gemini-3.1-pro']), rates: { input: 2, cachedInput: 0.2, output: 12 } },
  { matches: modelIncludes(['google', 'gemini'], ['gemini-2.5-flash-lite']), rates: { input: 0.1, cachedInput: 0.025, output: 0.4 } },
  { matches: modelIncludes(['google', 'gemini'], ['gemini-2.5-flash']), rates: { input: 0.3, cachedInput: 0.03, output: 2.5 } },
  { matches: modelIncludes(['google', 'gemini'], ['gemini-2.5-pro']), rates: { input: 1.25, cachedInput: 0.125, output: 10 } },

  { matches: modelIncludes(['xai', 'grok'], ['grok-4.5']), rates: { input: 2, cachedInput: 0.3, output: 6 } },
  { matches: modelIncludes(['xai', 'grok'], ['grok-4.3']), rates: { input: 1.25, cachedInput: 0.2, output: 2.5 } },
  { matches: modelIncludes(['xai', 'grok'], ['grok-build-0.1']), rates: { input: 1, cachedInput: 0.2, output: 2 } },
]

export function modelTokenRates(provider: string, model: string): ModelTokenRates | null {
  const normalizedProvider = provider.trim().toLowerCase()
  const normalizedModel = model.trim().toLowerCase()
  return PRICING_RULES.find(rule => rule.matches(normalizedProvider, normalizedModel))?.rates ?? null
}

export function estimateModelUsageCost(input: ModelUsageCostInput): ModelUsageCostEstimate {
  const rates = modelTokenRates(input.provider, input.model)
  if (!rates) return { estimatedCostMicrousd: 0, cacheSavingsMicrousd: 0 }

  const cachedTokens = Math.min(input.inputTokens, Math.max(0, input.cachedTokens))
  const uncachedInputTokens = Math.max(0, input.inputTokens - cachedTokens)
  // USD / MTok is numerically equal to micro-USD / token.
  const estimatedCostMicrousd = Math.round(
    uncachedInputTokens * rates.input
      + cachedTokens * rates.cachedInput
      + Math.max(0, input.outputTokens) * rates.output,
  )
  const cacheSavingsMicrousd = Math.round(
    cachedTokens * Math.max(0, rates.input - rates.cachedInput),
  )

  return { estimatedCostMicrousd, cacheSavingsMicrousd }
}
