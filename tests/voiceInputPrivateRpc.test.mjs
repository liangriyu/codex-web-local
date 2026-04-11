import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('bridge exposes web-local voice private rpc methods without changing app-server dto exports', async () => {
  const bridge = await read('../src/server/codexAppServerBridge.ts')
  const dtos = await read('../src/api/appServerDtos.ts')

  assert.match(bridge, /web-local\/voice-input\/capability\/read/)
  assert.match(bridge, /web-local\/voice-input\/transcription\/create/)
  assert.match(bridge, /handlePrivateRpc|handleVoiceInputPrivateRpc/)
  assert.match(bridge, /provider:\s*this\.voiceInputFallbackConfig\.provider|provider:\s*transcriptionService\.getCapability\(\)\.provider/)
  assert.match(bridge, /zhipu|glm-asr-2512/)
  assert.match(bridge, /rpc\(method: string, params: unknown\): Promise<unknown>/)
  assert.doesNotMatch(dtos, /voice-input/)
  assert.doesNotMatch(dtos, /transcription/)
})
