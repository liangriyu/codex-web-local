import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('http server no longer exposes dedicated voice transcription routes', async () => {
  const source = await read('../src/server/httpServer.ts')

  assert.doesNotMatch(source, /\/api\/voice-input-capability/)
  assert.doesNotMatch(source, /\/api\/transcriptions/)
})

test('service supports openai and zhipu providers for private rpc voice input', async () => {
  const source = await read('../src/server/transcriptionService.ts').catch(() => '')

  assert.match(source, /provider:\s*'openai'\s*\|\s*'zhipu'/)
  assert.match(source, /gpt-4o-mini-transcribe/)
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/audio\/transcriptions/)
  assert.match(source, /glm-asr-2512/)
  assert.match(source, /https:\/\/open\.bigmodel\.cn\/api\/paas\/v4\/audio\/transcriptions/)
  assert.match(source, /acceptedMimeTypes|ALLOWED_AUDIO_CONTENT_TYPES/)
  assert.match(source, /maxAudioBytes|MAX_AUDIO_BYTES/)
  assert.doesNotMatch(source, /whisper\.cpp/)
  assert.doesNotMatch(source, /--stt-command/)
})
