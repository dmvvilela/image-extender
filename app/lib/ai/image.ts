import { createOpenAI } from '@ai-sdk/openai'
import {
  generateText,
  type GeneratedFile,
  type ModelMessage,
} from 'ai'
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

/** Image models need a generous output budget; below ~512 tokens Gemini often returns text-only. */
const DEFAULT_IMAGE_MAX_OUTPUT_TOKENS = 8192

/** Convert a data URL or URL string to AI SDK image content. */
function toImagePart(url: string): { type: 'image'; image: string } {
  return { type: 'image', image: url }
}

export function buildUserMessage(parts: ImageContentPart[]): ModelMessage {
  const textParts = parts.filter(
    (part): part is { type: 'text'; text: string } => part.type === 'text'
  )
  const imageParts = parts.filter(
    (part): part is { type: 'image'; image: string } => part.type === 'image'
  )

  // Single-image edit/outpaint: instructions before image (AI SDK cookbook pattern).
  const ordered =
    imageParts.length === 1 && textParts.length >= 1
      ? [...textParts, ...imageParts]
      : [...imageParts, ...textParts]

  const content = ordered.map((part) => {
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

function isImageFile(file: GeneratedFile): boolean {
  const mediaType = file.mediaType?.toLowerCase() ?? ''
  if (mediaType.startsWith('image/')) return true
  // Gemini occasionally omits a proper image/* media type on inline image bytes.
  return (file.uint8Array?.length ?? 0) > 1024
}

type TextResultWithFiles = {
  files?: GeneratedFile[]
  steps?: Array<{ files?: GeneratedFile[] }>
  finishReason?: string
  text: string
}

function collectFilesFromResult(result: TextResultWithFiles): GeneratedFile[] {
  const stepFiles = result.steps?.flatMap((step) => step.files ?? []) ?? []
  if (stepFiles.length > 0) return stepFiles
  return result.files ?? []
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

function noImageGeneratedError(
  provider: 'google' | 'openai',
  modelId: string,
  result: Pick<TextResultWithFiles, 'finishReason' | 'text'>
): Error {
  const modelText = result.text?.trim()
  const detail = modelText
    ? ` The model replied: "${modelText.slice(0, 280)}${modelText.length > 280 ? '…' : ''}"`
    : ''
  const finish = result.finishReason ? ` (finish: ${result.finishReason})` : ''

  if (provider === 'google') {
    return new Error(
      `No image generated from ${modelId}${finish}.${detail} Try again, simplify the prompt, or switch models.`
    )
  }
  return new Error(
    `No image generated from OpenAI model (${modelId})${finish}.${detail} Try a Gemini model for image editing.`
  )
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
    maxOutputTokens = DEFAULT_IMAGE_MAX_OUTPUT_TOKENS,
  } = options

  const { model: languageModel, provider, modelId } = getLanguageModel(
    model,
    apiKeys,
    legacyApiKey
  )

  const userMessage = buildUserMessage(parts)

  if (provider === 'google') {
    let lastResult: TextResultWithFiles | null = null

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await generateText({
        model: languageModel,
        messages: [userMessage],
        maxOutputTokens,
        temperature:
          attempt === 0
            ? temperature
            : Math.min(1, (temperature ?? 0.5) + 0.25),
        providerOptions: {
          google: {
            responseModalities: ['TEXT', 'IMAGE'],
            ...(aspectRatio
              ? { imageConfig: { aspectRatio } }
              : {}),
          },
        },
      })
      lastResult = result

      const imageUrl = firstImageFromFiles(collectFilesFromResult(result))
      if (imageUrl) {
        return { imageUrl, text: result.text }
      }
    }

    throw noImageGeneratedError(
      'google',
      modelId,
      lastResult ?? { finishReason: 'unknown', text: '' }
    )
  }

  // OpenAI image models — multimodal chat with the image generation tool.
  const apiKey = resolveApiKey('openai', apiKeys, legacyApiKey)
  if (!apiKey) {
    throw new Error('OpenAI API key missing.')
  }
  const openai = createOpenAI({ apiKey })

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
    firstImageFromFiles(collectFilesFromResult(result))

  if (!imageUrl) {
    throw noImageGeneratedError('openai', modelId, result)
  }

  return { imageUrl, text: result.text }
}

export function firstImageFromFiles(
  files: GeneratedFile[] | undefined
): string | null {
  if (!files?.length) return null
  for (let i = files.length - 1; i >= 0; i--) {
    const file = files[i]
    if (!isImageFile(file)) continue
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
