export type VoiceInputMode = 'native' | 'openai-fallback' | 'unsupported'

export type VoiceInputSupport = {
  hasNativeRecognition: boolean
  hasOpenAiFallback: boolean
  preferredMode: VoiceInputMode
}

type GlobalSpeechRecognitionConstructor = new () => unknown

type WindowWithSpeechRecognition = Window & typeof globalThis & {
  SpeechRecognition?: GlobalSpeechRecognitionConstructor
  webkitSpeechRecognition?: GlobalSpeechRecognitionConstructor
}

function isKnownBrokenNativeSpeechRecognitionEnvironment(): boolean {
  if (typeof navigator === 'undefined') return false

  const platform = typeof navigator.platform === 'string' ? navigator.platform : ''
  const userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : ''
  const maxTouchPoints = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0
  const isMacLike = /Mac/.test(platform) || /Macintosh|Mac OS X/.test(userAgent)

  // iPadOS may report itself as Mac; keep touch-capable devices on the existing path.
  return isMacLike && maxTouchPoints === 0
}

function hasNativeSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false
  if (isKnownBrokenNativeSpeechRecognitionEnvironment()) return false
  const candidate = window as WindowWithSpeechRecognition
  return typeof candidate.SpeechRecognition === 'function'
    || typeof candidate.webkitSpeechRecognition === 'function'
}

export function detectVoiceInputSupport(): VoiceInputSupport {
  const hasNativeRecognition = hasNativeSpeechRecognition()
  return {
    hasNativeRecognition,
    hasOpenAiFallback: false,
    preferredMode: hasNativeRecognition ? 'native' : 'unsupported',
  }
}

export function resolveVoiceInputSupport(options: {
  hasNativeRecognition: boolean
  fallbackEnabled: boolean
}): VoiceInputSupport {
  if (options.hasNativeRecognition) {
    return {
      hasNativeRecognition: true,
      hasOpenAiFallback: options.fallbackEnabled,
      preferredMode: 'native',
    }
  }

  if (options.fallbackEnabled) {
    return {
      hasNativeRecognition: false,
      hasOpenAiFallback: true,
      preferredMode: 'openai-fallback',
    }
  }

  return {
    hasNativeRecognition: false,
    hasOpenAiFallback: false,
    preferredMode: 'unsupported',
  }
}
