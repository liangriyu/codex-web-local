import { Buffer } from 'node:buffer'

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'
const ZHIPU_TRANSCRIPTION_URL = 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions'
export const OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'
export const ZHIPU_TRANSCRIPTION_MODEL = 'glm-asr-2512'
const OPENAI_ALLOWED_AUDIO_CONTENT_TYPES = [
  'application/octet-stream',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/wav',
  'audio/x-m4a',
] as const
const ZHIPU_ALLOWED_AUDIO_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
] as const
export const MAX_AUDIO_BYTES = 2_000_000
export const ACCEPTED_AUDIO_CONTENT_TYPES = [...OPENAI_ALLOWED_AUDIO_CONTENT_TYPES]

export type VoiceInputFallbackConfig = {
  provider: 'openai' | 'zhipu'
  enabled: boolean
  apiKey?: string
  model: string
}

type TranscribeAudioInput = {
  audio: Buffer
  contentType: string
  language?: string
}

type OpenAiTranscriptionResponse = {
  text?: unknown
  error?: {
    message?: unknown
  }
}

type ZhipuTranscriptionResponse = {
  text?: unknown
  error?: {
    message?: unknown
  }
  message?: unknown
}

export class TranscriptionServiceError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'TranscriptionServiceError'
    this.status = status
  }
}

function normalizeContentType(contentType: string): string {
  return contentType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

function getAcceptedAudioContentTypes(provider: VoiceInputFallbackConfig['provider']): readonly string[] {
  return provider === 'zhipu'
    ? ZHIPU_ALLOWED_AUDIO_CONTENT_TYPES
    : OPENAI_ALLOWED_AUDIO_CONTENT_TYPES
}

function pickUploadFilename(contentType: string): string {
  const normalized = normalizeContentType(contentType)
  if (normalized === 'audio/mp4' || normalized === 'audio/x-m4a') return 'voice-input.m4a'
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') return 'voice-input.mp3'
  if (normalized === 'audio/ogg') return 'voice-input.ogg'
  if (normalized === 'audio/wav') return 'voice-input.wav'
  return 'voice-input.webm'
}

function normalizeLanguage(language: string | undefined): string | undefined {
  const normalized = language?.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized.startsWith('zh')) return 'zh'
  if (normalized.startsWith('en')) return 'en'
  return normalized
}

function extractOpenAiErrorMessage(payload: OpenAiTranscriptionResponse, fallback: string): string {
  if (typeof payload.error?.message === 'string' && payload.error.message.trim()) {
    return payload.error.message
  }
  return fallback
}

function extractZhipuErrorMessage(payload: ZhipuTranscriptionResponse, fallback: string): string {
  if (typeof payload.error?.message === 'string' && payload.error.message.trim()) {
    return payload.error.message
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message
  }
  return fallback
}

function validateAudioInput(
  input: TranscribeAudioInput,
  isEnabled: boolean,
  provider: VoiceInputFallbackConfig['provider'],
): void {
  if (!isEnabled) {
    throw new TranscriptionServiceError('Voice transcription fallback is disabled', 503)
  }
  if (input.audio.length === 0) {
    throw new TranscriptionServiceError('Audio payload is empty', 400)
  }
  if (input.audio.length > MAX_AUDIO_BYTES) {
    throw new TranscriptionServiceError('Audio payload too large', 413)
  }
  if (!getAcceptedAudioContentTypes(provider).some((allowed) => normalizeContentType(allowed) === normalizeContentType(input.contentType))) {
    throw new TranscriptionServiceError('Unsupported audio content type', 415)
  }
}

export function createTranscriptionService(config: VoiceInputFallbackConfig) {
  return {
    getCapability() {
      return {
        fallbackEnabled: this.isVoiceInputFallbackEnabled(),
        provider: config.provider,
        model: config.model,
        maxAudioBytes: MAX_AUDIO_BYTES,
        acceptedMimeTypes: [...getAcceptedAudioContentTypes(config.provider)],
      }
    },

    isVoiceInputFallbackEnabled(): boolean {
      return config.enabled === true && typeof config.apiKey === 'string' && config.apiKey.length > 0
    },

    async transcribeAudio(input: TranscribeAudioInput): Promise<string> {
      if (config.provider === 'zhipu') {
        return this.transcribeAudioWithZhipu(input)
      }
      return this.transcribeAudioWithOpenAi(input)
    },

    async transcribeAudioWithOpenAi(input: TranscribeAudioInput): Promise<string> {
      validateAudioInput(input, this.isVoiceInputFallbackEnabled(), 'openai')

      const formData = new FormData()
      formData.append('model', config.model)
      formData.append(
        'file',
        new Blob([new Uint8Array(input.audio)], { type: input.contentType }),
        pickUploadFilename(input.contentType),
      )
      const language = normalizeLanguage(input.language)
      if (language) {
        formData.append('language', language)
      }

      let response: Response
      try {
        response = await fetch(OPENAI_TRANSCRIPTION_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: formData,
        })
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : 'OpenAI transcription request failed'
        throw new TranscriptionServiceError(message, 502)
      }

      let payload: OpenAiTranscriptionResponse = {}
      try {
        payload = await response.json() as OpenAiTranscriptionResponse
      } catch {
        payload = {}
      }

      if (!response.ok) {
        throw new TranscriptionServiceError(
          extractOpenAiErrorMessage(payload, 'OpenAI transcription request failed'),
          response.status >= 400 && response.status < 600 ? response.status : 502,
        )
      }

      const text = typeof payload.text === 'string' ? payload.text.trim() : ''
      if (!text) {
        throw new TranscriptionServiceError('OpenAI transcription response did not include text', 502)
      }

      return text
    },

    async transcribeAudioWithZhipu(input: TranscribeAudioInput): Promise<string> {
      validateAudioInput(input, this.isVoiceInputFallbackEnabled(), 'zhipu')

      const formData = new FormData()
      formData.append('model', config.model)
      formData.append('stream', 'false')
      formData.append(
        'file',
        new Blob([new Uint8Array(input.audio)], { type: input.contentType }),
        pickUploadFilename(input.contentType),
      )

      let response: Response
      try {
        response = await fetch(ZHIPU_TRANSCRIPTION_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: formData,
        })
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : 'Zhipu transcription request failed'
        throw new TranscriptionServiceError(message, 502)
      }

      let payload: ZhipuTranscriptionResponse = {}
      try {
        payload = await response.json() as ZhipuTranscriptionResponse
      } catch {
        payload = {}
      }

      if (!response.ok) {
        throw new TranscriptionServiceError(
          extractZhipuErrorMessage(payload, 'Zhipu transcription request failed'),
          response.status >= 400 && response.status < 600 ? response.status : 502,
        )
      }

      const text = typeof payload.text === 'string' ? payload.text.trim() : ''
      if (!text) {
        throw new TranscriptionServiceError('Zhipu transcription response did not include text', 502)
      }

      return text
    },
  }
}
