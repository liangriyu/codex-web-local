import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('voice input wiring uses capability detection and keeps transcript inside composer draft', async () => {
  const composer = await read('../src/components/content/ThreadComposer.vue')
  const voiceInput = await read('../src/utils/voiceInput.ts')
  const transcriptionGateway = await read('../src/api/transcriptionGateway.ts')
  const uiText = await read('../src/i18n/uiText.ts')

  assert.match(voiceInput, /export type VoiceInputMode = 'native' \| 'fallback' \| 'unsupported'/)
  assert.match(voiceInput, /export type VoiceInputSupport = \{/)
  assert.match(voiceInput, /SpeechRecognition/)
  assert.match(voiceInput, /webkitSpeechRecognition/)
  assert.match(voiceInput, /MediaRecorder/)
  assert.match(voiceInput, /isSecureContext/)
  assert.match(voiceInput, /function isIosBrowser\(/)
  assert.match(voiceInput, /function detectVoiceInputSupport\(\)/)
  assert.match(voiceInput, /preferredMode:\s*'fallback'/)

  assert.match(transcriptionGateway, /export async function requestLocalTranscription\(/)
  assert.match(transcriptionGateway, /\/api\/transcriptions/)
  assert.match(transcriptionGateway, /FormData/)
  assert.match(transcriptionGateway, /audio/)

  assert.match(composer, /thread-composer-voice-button/)
  assert.match(composer, /voiceInputState/)
  assert.match(composer, /startNativeSpeechRecognition/)
  assert.match(composer, /startFallbackRecording/)
  assert.match(composer, /requestLocalTranscription/)
  assert.match(composer, /draft\.value = mergeDraftWithTranscript\(/)
  assert.doesNotMatch(composer, /emit\('submit',\s*\{\s*text:\s*transcript/);

  assert.match(uiText, /'composer\.voiceInput'/)
  assert.match(uiText, /'composer\.voiceListening'/)
  assert.match(uiText, /'composer\.voiceRecording'/)
  assert.match(uiText, /'composer\.voiceTranscribing'/)
  assert.match(uiText, /'composer\.voiceUnsupported'/)
  assert.match(uiText, /'composer\.voicePermissionDenied'/)
})
