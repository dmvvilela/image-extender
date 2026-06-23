'use client'

export type AiProvider = 'google' | 'openai'

export type ModelOption = {
  /** Stable id used in UI / localStorage (keeps OpenRouter-style slugs for familiarity). */
  value: string
  /** Native model id passed to @ai-sdk/google or @ai-sdk/openai. */
  modelId: string
  provider: AiProvider
  label: string
  hint?: string
  /**
   * Max best-of-N attempts for horizontal extensions on this model.
   * Slow models (GPT-5.4-image-2 takes ~4 min/call) get 1 to avoid
   * multi-minute blind waits; fast models get 3 for seam-quality picking.
   */
  maxAttempts: number
  /** Rough single-call expected duration, shown to the user as guidance. */
  approxSecondsPerCall: number
}

export const MODELS: ModelOption[] = [
  {
    value: 'openai/gpt-5.4-image-2',
    modelId: 'gpt-5.4-image-2',
    provider: 'openai',
    label: 'GPT-5.4 Image 2',
    hint: 'OpenAI · high fidelity · slower',
    maxAttempts: 1,
    approxSecondsPerCall: 240,
  },
  {
    value: 'google/gemini-3-pro-image-preview',
    modelId: 'gemini-3-pro-image-preview',
    provider: 'google',
    label: 'Gemini 3 Pro Image',
    hint: 'Nano Banana Pro · highest fidelity',
    maxAttempts: 1,
    approxSecondsPerCall: 75,
  },
  {
    value: 'google/gemini-3.1-flash-image-preview',
    modelId: 'gemini-3.1-flash-image-preview',
    provider: 'google',
    label: 'Gemini 3 Flash Image',
    hint: 'Nano Banana 2 · fast · default',
    maxAttempts: 3,
    approxSecondsPerCall: 18,
  },
  {
    value: 'google/gemini-2.5-flash-image',
    modelId: 'gemini-2.5-flash-image',
    provider: 'google',
    label: 'Gemini 2.5 Flash Image',
    hint: 'Nano Banana · stable',
    maxAttempts: 3,
    approxSecondsPerCall: 15,
  },
]

export const DEFAULT_MODEL = 'google/gemini-3.1-flash-image-preview'

export function getModelConfig(value: string): ModelOption {
  const direct = MODELS.find((m) => m.value === value || m.modelId === value)
  if (direct) return direct

  // Legacy OpenRouter slug without provider prefix
  const withGoogle = `google/${value}`
  const withOpenai = `openai/${value}`
  return (
    MODELS.find((m) => m.value === withGoogle || m.value === withOpenai) ||
    MODELS.find((m) => m.value === DEFAULT_MODEL) ||
    MODELS[0]
  )
}

export function getProviderForModel(value: string): AiProvider {
  return getModelConfig(value).provider
}

export function skipsArtDirectorReview(value: string): boolean {
  return getModelConfig(value).provider === 'openai'
}

export function maskKey(key: string): string {
  if (!key) return ''
  const tail = key.slice(-4)
  return `${'•'.repeat(Math.max(4, Math.min(20, key.length - 4)))}${tail}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Art styles — flat list with optional grouping for the dropdown
// ─────────────────────────────────────────────────────────────────────────────
