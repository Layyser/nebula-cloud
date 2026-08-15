import { describe, expect, test } from 'bun:test'
import { estimateModelUsageCost, modelTokenRates } from '../src/modelPricing'

describe('model pricing fallback', () => {
  test('resolves model snapshots and aliases by family', () => {
    expect(modelTokenRates('openai', 'gpt-5.6-luna-2026-07-30')).toEqual({
      input: 0.2,
      cachedInput: 0.02,
      output: 1.2,
    })
    expect(modelTokenRates('anthropic', 'claude-sonnet-4-6')).toEqual({
      input: 3,
      cachedInput: 0.3,
      output: 15,
    })
    expect(modelTokenRates('unknown', 'private-model')).toBeNull()
  })

  test('prices uncached input, cached input, and output independently', () => {
    expect(estimateModelUsageCost({
      provider: 'openai',
      model: 'gpt-5.6-luna',
      inputTokens: 1_000_000,
      cachedTokens: 400_000,
      outputTokens: 100_000,
    })).toEqual({
      estimatedCostMicrousd: 248_000,
      cacheSavingsMicrousd: 72_000,
    })
  })
})
