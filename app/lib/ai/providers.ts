import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import {
  DEFAULT_MODEL,
  getModelConfig,
  type AiProvider,
} from '@/app/lib/models'

export type ApiKeys = {
  google?: string
  openai?: string
}

const ENV_KEYS: Record<AiProvider, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
}

/** Fast text model for art-director / QA routes (never the image models). */
export const TEXT_MODEL_ID = 'gemini-2.0-flash'

export function resolveApiKey(
  provider: AiProvider,
  apiKeys?: ApiKeys | null,
  legacyApiKey?: string
): string | null {
  const fromClient =
    provider === 'google'
      ? apiKeys?.google?.trim()
      : apiKeys?.openai?.trim()

  if (fromClient) return fromClient

  if (typeof legacyApiKey === 'string' && legacyApiKey.trim()) {
    return legacyApiKey.trim()
  }

  const envName = ENV_KEYS[provider]
  const fromEnv = process.env[envName]
  return fromEnv?.trim() || null
}

export function missingKeyMessage(provider: AiProvider): string {
  return provider === 'google'
    ? 'Google AI API key missing. Add one in Settings (or set GOOGLE_GENERATIVE_AI_API_KEY).'
    : 'OpenAI API key missing. Add one in Settings (or set OPENAI_API_KEY).'
}

export function getLanguageModel(
  modelValue: string,
  apiKeys?: ApiKeys | null,
  legacyApiKey?: string
): { model: LanguageModel; provider: AiProvider; modelId: string } {
  const config = getModelConfig(modelValue)
  const apiKey = resolveApiKey(config.provider, apiKeys, legacyApiKey)

  if (!apiKey) {
    throw new MissingApiKeyError(config.provider)
  }

  if (config.provider === 'google') {
    const google = createGoogleGenerativeAI({ apiKey })
    return {
      model: google(config.modelId),
      provider: 'google',
      modelId: config.modelId,
    }
  }

  const openai = createOpenAI({ apiKey })
  return {
    model: openai(config.modelId),
    provider: 'openai',
    modelId: config.modelId,
  }
}

export function getTextModel(
  apiKeys?: ApiKeys | null,
  legacyApiKey?: string
): LanguageModel {
  const apiKey = resolveApiKey('google', apiKeys, legacyApiKey)
  if (!apiKey) {
    throw new MissingApiKeyError('google')
  }
  const google = createGoogleGenerativeAI({ apiKey })
  return google(TEXT_MODEL_ID)
}

export class MissingApiKeyError extends Error {
  readonly provider: AiProvider

  constructor(provider: AiProvider) {
    super(missingKeyMessage(provider))
    this.name = 'MissingApiKeyError'
    this.provider = provider
  }
}

export function isMissingApiKeyError(error: unknown): error is MissingApiKeyError {
  return error instanceof MissingApiKeyError
}

/** Normalize request body keys — supports new `apiKeys` and legacy `apiKey`. */
export function parseApiKeys(body: {
  apiKey?: unknown
  apiKeys?: unknown
}): ApiKeys {
  const keys: ApiKeys = {}
  if (body.apiKeys && typeof body.apiKeys === 'object') {
    const o = body.apiKeys as Record<string, unknown>
    if (typeof o.google === 'string' && o.google.trim()) {
      keys.google = o.google.trim()
    }
    if (typeof o.openai === 'string' && o.openai.trim()) {
      keys.openai = o.openai.trim()
    }
  }
  // Legacy single key — assume Google if it looks like one, else try both env fallbacks
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    const k = body.apiKey.trim()
    if (k.startsWith('sk-') && !k.startsWith('sk-or-')) {
      keys.openai = k
    } else if (!keys.google) {
      keys.google = k
    }
  }
  return keys
}

export function defaultImageModelValue(): string {
  return DEFAULT_MODEL
}
