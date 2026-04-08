export type VoiceInputMode = 'native' | 'fallback' | 'unsupported'

export type VoiceInputSupport = {
  hasNativeRecognition: boolean
  hasFallbackRecording: boolean
  requiresSecureContext: boolean
  preferredMode: VoiceInputMode
}

type GlobalSpeechRecognitionConstructor = new () => unknown

type WindowWithSpeechRecognition = Window & typeof globalThis & {
  SpeechRecognition?: GlobalSpeechRecognitionConstructor
  webkitSpeechRecognition?: GlobalSpeechRecognitionConstructor
}

function getNavigatorUserAgent(): string {
  if (typeof navigator === 'undefined') return ''
  return navigator.userAgent || ''
}

export function isIosBrowser(): boolean {
  const userAgent = getNavigatorUserAgent()
  return /iPad|iPhone|iPod/iu.test(userAgent)
}

function hasNativeSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false
  const candidate = window as WindowWithSpeechRecognition
  return typeof candidate.SpeechRecognition === 'function'
    || typeof candidate.webkitSpeechRecognition === 'function'
}

function hasFallbackMediaRecorder(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof MediaRecorder !== 'undefined'
}

export function detectVoiceInputSupport(): VoiceInputSupport {
  const hasNativeRecognition = hasNativeSpeechRecognition()
  const hasFallbackRecording = hasFallbackMediaRecorder()
  const secureContextAvailable = typeof window !== 'undefined' ? window.isSecureContext === true : false
  const requiresSecureContext = hasFallbackRecording && secureContextAvailable === false

  if (isIosBrowser() && hasFallbackRecording) {
    return {
      hasNativeRecognition,
      hasFallbackRecording,
      requiresSecureContext,
      preferredMode: 'fallback',
    }
  }

  if (hasNativeRecognition) {
    return {
      hasNativeRecognition,
      hasFallbackRecording,
      requiresSecureContext,
      preferredMode: 'native',
    }
  }

  if (hasFallbackRecording) {
    return {
      hasNativeRecognition,
      hasFallbackRecording,
      requiresSecureContext,
      preferredMode: 'fallback',
    }
  }

  return {
    hasNativeRecognition: false,
    hasFallbackRecording: false,
    requiresSecureContext: false,
    preferredMode: 'unsupported',
  }
}
