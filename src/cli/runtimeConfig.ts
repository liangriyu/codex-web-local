import type { LocalTranscriptionConfig } from '../server/transcriptionService'

export type RawCliRuntimeOptions = {
  port: string
  host?: string
  daemon?: boolean
  password: string | boolean
  httpsCert?: string
  httpsKey?: string
  sttCommand?: string
  sttModel?: string
  sttLanguage?: string
  sttTimeoutMs?: string
}

export type NormalizedCliRuntimeConfig = {
  port: number
  host?: string
  daemon: boolean
  password: string | boolean
  https?: {
    cert: string
    key: string
  }
  transcription?: LocalTranscriptionConfig
}

export function formatAccessUrl(bindHost: string | undefined, bindPort: number, useHttps = false): string {
  const protocol = useHttps ? 'https' : 'http'
  if (!bindHost || bindHost === '0.0.0.0' || bindHost === '::') {
    return `${protocol}://localhost:${String(bindPort)}`
  }
  const normalizedHost = bindHost.includes(':') && !bindHost.startsWith('[') ? `[${bindHost}]` : bindHost
  return `${protocol}://${normalizedHost}:${String(bindPort)}`
}

export function normalizeCliRuntimeConfig(raw: RawCliRuntimeOptions): NormalizedCliRuntimeConfig {
  const httpsCert = raw.httpsCert?.trim() ?? ''
  const httpsKey = raw.httpsKey?.trim() ?? ''

  if (httpsCert && !httpsKey) {
    throw new Error('HTTPS key is required when HTTPS cert is provided')
  }
  if (httpsKey && !httpsCert) {
    throw new Error('HTTPS cert is required when HTTPS key is provided')
  }

  const sttCommand = raw.sttCommand?.trim() ?? ''
  const sttModel = raw.sttModel?.trim() ?? ''
  const sttLanguage = raw.sttLanguage?.trim() ?? ''
  const parsedTimeout = Number.parseInt(raw.sttTimeoutMs ?? '', 10)

  return {
    port: Number.parseInt(raw.port, 10),
    host: raw.host?.trim() || undefined,
    daemon: raw.daemon === true,
    password: raw.password,
    https: httpsCert && httpsKey
      ? {
          cert: httpsCert,
          key: httpsKey,
        }
      : undefined,
    transcription: sttCommand && sttModel
      ? {
          command: sttCommand,
          model: sttModel,
          language: sttLanguage || undefined,
          timeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 45000,
        }
      : undefined,
  }
}
