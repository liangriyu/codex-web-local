export type RawCliRuntimeOptions = {
  port: string
  host?: string
  daemon?: boolean
  password: string | boolean
  httpsCert?: string
  httpsKey?: string
  serverMode?: string
}

export type VoiceInputProvider = 'openai' | 'zhipu'
export type ServerMode = 'shared' | 'isolated'

export type VoiceInputFallbackConfig = {
  provider: VoiceInputProvider
  enabled: boolean
  apiKey?: string
  model: string
}

export type NormalizedCliRuntimeConfig = {
  port: number
  host?: string
  daemon: boolean
  password: string | boolean
  serverMode: ServerMode
  https?: {
    cert: string
    key: string
  }
  voiceInputFallback: VoiceInputFallbackConfig
}

export function formatAccessUrl(bindHost: string | undefined, bindPort: number, useHttps = false): string {
  const protocol = useHttps ? 'https' : 'http'
  if (!bindHost || bindHost === '0.0.0.0' || bindHost === '::') {
    return `${protocol}://localhost:${String(bindPort)}`
  }
  const normalizedHost = bindHost.includes(':') && !bindHost.startsWith('[') ? `[${bindHost}]` : bindHost
  return `${protocol}://${normalizedHost}:${String(bindPort)}`
}

function normalizeVoiceInputFallbackConfig(env: NodeJS.ProcessEnv): VoiceInputFallbackConfig {
  const rawProvider = env.CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER?.trim().toLowerCase()
  const provider: VoiceInputProvider = rawProvider === 'zhipu' ? 'zhipu' : 'openai'

  if (provider === 'zhipu') {
    const apiKey = env.ZHIPU_API_KEY?.trim()
    const enabledFlag = env.CODEX_WEB_LOCAL_ZHIPU_TRANSCRIBE_ENABLED?.trim().toLowerCase()
    const enabled = Boolean(apiKey) && (enabledFlag === '1' || enabledFlag === 'true' || enabledFlag === 'yes')

    return {
      provider,
      enabled,
      apiKey: apiKey || undefined,
      model: 'glm-asr-2512',
    }
  }

  const apiKey = env.OPENAI_API_KEY?.trim()
  const enabledFlag = env.CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED?.trim().toLowerCase()
  const enabled = Boolean(apiKey) && (enabledFlag === '1' || enabledFlag === 'true' || enabledFlag === 'yes')

  return {
    provider,
    enabled,
    apiKey: apiKey || undefined,
    model: 'gpt-4o-mini-transcribe',
  }
}

function normalizeServerMode(rawMode: string | undefined): ServerMode {
  const normalizedMode = rawMode?.trim().toLowerCase()
  if (!normalizedMode) {
    return 'shared'
  }
  if (normalizedMode === 'shared' || normalizedMode === 'isolated') {
    return normalizedMode
  }
  throw new Error(`Unsupported server mode: ${rawMode}`)
}

export function normalizeCliRuntimeConfig(
  raw: RawCliRuntimeOptions,
  env: NodeJS.ProcessEnv = process.env,
): NormalizedCliRuntimeConfig {
  const httpsCert = raw.httpsCert?.trim() ?? ''
  const httpsKey = raw.httpsKey?.trim() ?? ''

  if (httpsCert && !httpsKey) {
    throw new Error('HTTPS key is required when HTTPS cert is provided')
  }
  if (httpsKey && !httpsCert) {
    throw new Error('HTTPS cert is required when HTTPS key is provided')
  }

  return {
    port: Number.parseInt(raw.port, 10),
    host: raw.host?.trim() || undefined,
    daemon: raw.daemon === true,
    password: raw.password,
    serverMode: normalizeServerMode(raw.serverMode),
    https: httpsCert && httpsKey
      ? {
          cert: httpsCert,
          key: httpsKey,
        }
      : undefined,
    voiceInputFallback: normalizeVoiceInputFallbackConfig(env),
  }
}
