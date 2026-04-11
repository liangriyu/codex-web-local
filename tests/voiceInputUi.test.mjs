import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('voice input wiring uses capability detection and keeps transcript inside composer draft', async () => {
  const composer = await read('../src/components/content/ThreadComposer.vue')
  const voiceInput = await read('../src/utils/voiceInput.ts')
  const gateway = await read('../src/api/voiceInputRpc.ts').catch(() => '')
  const uiText = await read('../src/i18n/uiText.ts')
  const bridge = await read('../src/server/codexAppServerBridge.ts')

  assert.match(voiceInput, /export type VoiceInputMode = 'native' \| 'openai-fallback' \| 'unsupported'/)
  assert.match(voiceInput, /export type VoiceInputSupport = \{/)
  assert.match(voiceInput, /SpeechRecognition/)
  assert.match(voiceInput, /webkitSpeechRecognition/)
  assert.match(voiceInput, /isKnownBrokenNativeSpeechRecognitionEnvironment/)
  assert.match(voiceInput, /Macintosh|Mac OS X|navigator\.platform|navigator\.maxTouchPoints/)
  assert.match(voiceInput, /function detectVoiceInputSupport\(\)/)
  assert.match(voiceInput, /function resolveVoiceInputSupport\(/)
  assert.match(voiceInput, /preferredMode:\s*'native'/)
  assert.match(voiceInput, /preferredMode:\s*'openai-fallback'/)

  assert.match(composer, /thread-composer-voice-button/)
  assert.match(composer, /voiceInputState/)
  assert.match(composer, /startNativeSpeechRecognition/)
  assert.match(composer, /startFallbackRecording/)
  assert.match(composer, /transcribeFallbackRecording/)
  assert.match(composer, /convertFallbackAudioForProvider|convertAudioBlobToWav|encodeWavPcm16/)
  assert.match(composer, /AudioContext|webkitAudioContext/)
  assert.match(composer, /audio\/wav/)
  assert.match(composer, /recording-fallback/)
  assert.match(composer, /transcribing-fallback/)
  assert.match(composer, /readVoiceInputCapability/)
  assert.match(composer, /createVoiceInputTranscription/)
  assert.match(composer, /MediaRecorder/)
  assert.match(composer, /composer\.voiceQuotaExceeded/)
  assert.match(composer, /mapVoiceInputTranscriptionError/)
  assert.match(composer, /insufficient_quota|quota exceeded|voiceQuotaExceeded/)
  assert.match(composer, /draft\.value = mergeDraftWithTranscript\(/)
  assert.doesNotMatch(composer, /requestLocalTranscription/)
  assert.doesNotMatch(composer, /fetchVoiceInputCapability/)
  assert.doesNotMatch(composer, /requestOpenAiTranscription/)
  assert.doesNotMatch(composer, /emit\('submit',\s*\{\s*text:\s*transcript/);

  assert.match(gateway, /readVoiceInputCapability/)
  assert.match(gateway, /createVoiceInputTranscription/)
  assert.match(gateway, /web-local\/voice-input\/capability\/read/)
  assert.match(gateway, /web-local\/voice-input\/transcription\/create/)
  assert.match(gateway, /provider:\s*typeof response\.provider === 'string' \? response\.provider : 'openai'/)
  assert.match(gateway, /model:\s*typeof response\.model === 'string' \? response\.model/)

  assert.match(bridge, /insufficient_quota|quota exceeded|OpenAI transcription quota exceeded/)

  assert.match(uiText, /'composer\.voiceInput'/)
  assert.match(uiText, /'composer\.voiceListening'/)
  assert.match(uiText, /'composer\.voicePermissionDenied'/)
  assert.match(uiText, /'composer\.voiceQuotaExceeded'/)
  assert.match(uiText, /'composer\.voiceRecording'/)
  assert.match(uiText, /'composer\.voiceTranscribing'/)
})
