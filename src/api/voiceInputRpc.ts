import { CodexApiError } from './codexErrors'
import { rpcCall } from './codexRpcClient'

type VoiceInputCapabilityRpcResponse = {
  fallbackEnabled?: unknown
  provider?: unknown
  model?: unknown
  maxAudioBytes?: unknown
  acceptedMimeTypes?: unknown
}

type VoiceInputTranscriptionRpcResponse = {
  text?: unknown
  provider?: unknown
  model?: unknown
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export async function readVoiceInputCapability(signal?: AbortSignal): Promise<{
  fallbackEnabled: boolean
  provider: string
  model: string
  maxAudioBytes: number
  acceptedMimeTypes: string[]
}> {
  const response = await rpcCall<VoiceInputCapabilityRpcResponse>(
    'web-local/voice-input/capability/read',
    {},
    { signal },
  )

  return {
    fallbackEnabled: response.fallbackEnabled === true,
    provider: typeof response.provider === 'string' ? response.provider : 'openai',
    model: typeof response.model === 'string' ? response.model : 'gpt-4o-mini-transcribe',
    maxAudioBytes: typeof response.maxAudioBytes === 'number' ? response.maxAudioBytes : 0,
    acceptedMimeTypes: Array.isArray(response.acceptedMimeTypes)
      ? response.acceptedMimeTypes.filter((value): value is string => typeof value === 'string')
      : [],
  }
}

export async function createVoiceInputTranscription(
  blob: Blob,
  options: { language?: string } = {},
  signal?: AbortSignal,
): Promise<string> {
  const response = await rpcCall<VoiceInputTranscriptionRpcResponse>(
    'web-local/voice-input/transcription/create',
    {
      audioBase64: await blobToBase64(blob),
      contentType: blob.type || 'application/octet-stream',
      language: options.language ?? null,
      source: 'composer-fallback',
    },
    { signal },
  )

  const text = typeof response.text === 'string' ? response.text.trim() : ''
  if (!text) {
    throw new CodexApiError('Voice transcription response did not include text', {
      code: 'invalid_response',
      method: 'web-local/voice-input/transcription/create',
    })
  }

  return text
}
