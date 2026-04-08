import { CodexApiError, extractErrorMessage, normalizeCodexApiError } from './codexErrors'

type LocalTranscriptionResponse = {
  text: string
  language?: string | null
  durationMs?: number | null
  engine?: string | null
}

export async function requestLocalTranscription(
  audio: Blob,
  options: { language?: string; signal?: AbortSignal } = {},
): Promise<LocalTranscriptionResponse> {
  const formData = new FormData()
  formData.append('audio', audio, 'voice-input.webm')
  if (options.language) {
    formData.append('language', options.language)
  }

  let response: Response
  try {
    response = await fetch('/api/transcriptions', {
      method: 'POST',
      body: formData,
      signal: options.signal,
    })
  } catch (error) {
    throw normalizeCodexApiError(error, 'Local transcription request failed', 'POST /api/transcriptions')
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new CodexApiError(extractErrorMessage(payload, 'Local transcription failed'), {
      code: 'http_error',
      method: 'POST /api/transcriptions',
      status: response.status,
    })
  }

  return payload as LocalTranscriptionResponse
}
