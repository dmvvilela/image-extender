import { createOpenAI } from '@ai-sdk/openai'
import { generateText, type GeneratedFile, type ModelMessage } from 'ai'
import {
  getLanguageModel,
  isMissingApiKeyError,
  resolveApiKey,
  type ApiKeys,
} from '@/app/lib/ai/providers'

export type ImageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string }

export type GenerateImageOptions = {
  model: string
  apiKeys?: ApiKeys
  legacyApiKey?: string
  parts: ImageContentPart[]
  aspectRatio?: string
  temperature?: number
  maxOutputTokens?: number
}

export type GenerateImageResult = {
  imageUrl: string
  text: string
}

/** Convert a data URL or URL string to AI SDK image content. */
function toImagePart(url: string): { type: 'image'; image: string } {
  return { type: 'image', image: url }
}

export function buildUserMessage(parts: ImageContentPart[]): ModelMessage {
  const content = parts.map((part) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text }
    }
    return toImagePart(part.image)
  })
  return { role: 'user', content }
}

function fileToDataUrl(file: GeneratedFile): string | null {
  if (file.base64) {
    const mime = file.mediaType || 'image/png'
    if (file.base64.startsWith('data:')) return file.base64
    return `data:${mime};base64,${file.base64}`
  }
  if (file.uint8Array && file.uint8Array.length > 0) {
    const mime = file.mediaType || 'image/png'
    const b64 = Buffer.from(file.uint8Array).toString('base64')
    return `data:${mime};base64,${b64}`
  }
  return null
}

function imageFromToolResults(
  staticToolResults: Array<{ toolName: string; output: unknown }>
): string | null {
  for (const tr of staticToolResults) {
    if (tr.toolName !== 'image_generation') continue
    const output = tr.output as { result?: string } | undefined
    if (typeof output?.result === 'string' && output.result.length > 100) {
      const raw = output.result
      if (raw.startsWith('data:image')) return raw
      return `data:image/png;base64,${raw}`
    }
  }
  return null
}

export async function generateImageFromParts(
  options: GenerateImageOptions
): Promise<GenerateImageResult> {
  const {
    model,
    apiKeys,
    legacyApiKey,
    parts,
    aspectRatio,
    temperature,
    maxOutputTokens = 2000,
  } = options

  const { model: languageModel, provider } = getLanguageModel(
    model,
    apiKeys,
    legacyApiKey
  )

  const userMessage = buildUserMessage(parts)

  if (provider === 'google') {
    const result = await generateText({
      model: languageModel,
      messages: [userMessage],
      maxOutputTokens,
      temperature,
      providerOptions: {
        google: {
          responseModalities: ['TEXT', 'IMAGE'],
          ...(aspectRatio
            ? { imageConfig: { aspectRatio } }
            : {}),
        },
      },
    })

    const imageUrl = firstImageFromFiles(result.files)
    if (!imageUrl) {
      throw new Error(
        'No image generated. The model responded without image output.'
      )
    }
    return { imageUrl, text: result.text }
  }

  // OpenAI image models — multimodal chat with the image generation tool.
  const apiKey = resolveApiKey('openai', apiKeys, legacyApiKey)
  if (!apiKey) {
    throw new Error('OpenAI API key missing.')
  }
  const openai = createOpenAI({ apiKey })
  const { modelId } = getLanguageModel(model, apiKeys, legacyApiKey)

  const result = await generateText({
    model: languageModel,
    messages: [userMessage],
    maxOutputTokens,
    temperature,
    tools: {
      image_generation: openai.tools.imageGeneration({
        outputFormat: 'png',
        quality: 'high',
      }),
    },
    toolChoice: { type: 'tool', toolName: 'image_generation' },
  })

  let imageUrl =
    imageFromToolResults(result.staticToolResults) ||
    firstImageFromFiles(result.files)

  if (!imageUrl) {
    throw new Error(
      `No image generated from OpenAI model (${modelId}). Try a Gemini model for image editing.`
    )
  }

  return { imageUrl, text: result.text }
}

export function firstImageFromFiles(
  files: GeneratedFile[] | undefined
): string | null {
  if (!files?.length) return null
  for (const file of files) {
    if (!file.mediaType?.startsWith('image/')) continue
    const url = fileToDataUrl(file)
    if (url) return url
  }
  return null
}

export function apiKeyErrorResponse(error: unknown): Response | null {
  if (isMissingApiKeyError(error)) {
    return Response.json({ error: error.message }, { status: 401 })
  }
  return null
}
