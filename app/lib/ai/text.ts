import { generateText, type ModelMessage } from 'ai'
import {
  getLanguageModel,
  getTextModel,
  isMissingApiKeyError,
  parseApiKeys,
  type ApiKeys,
} from '@/app/lib/ai/providers'

export type TextGenOptions = {
  model?: string
  apiKeys?: ApiKeys
  legacyApiKey?: string
  system?: string
  messages: ModelMessage[]
  maxOutputTokens?: number
  temperature?: number
}

export async function generateTextCompletion(options: TextGenOptions): Promise<string> {
  const { model, apiKeys, legacyApiKey, system, messages, maxOutputTokens, temperature } =
    options

  const languageModel = model
    ? getLanguageModel(model, apiKeys, legacyApiKey).model
    : getTextModel(apiKeys, legacyApiKey)

  const result = await generateText({
    model: languageModel,
    system,
    messages,
    maxOutputTokens,
    temperature,
  })

  return result.text.trim()
}

export function apiKeyErrorResponse(error: unknown): Response | null {
  if (isMissingApiKeyError(error)) {
    return Response.json({ error: error.message }, { status: 401 })
  }
  return null
}

export { parseApiKeys }
