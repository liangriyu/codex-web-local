import assert from 'node:assert/strict'
import test from 'node:test'

import { formatAccessUrl, normalizeCliRuntimeConfig } from '../src/cli/runtimeConfig.ts'

test('normalizeCliRuntimeConfig rejects partial https configuration', () => {
  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: '3000',
      httpsCert: '/tmp/dev.pem',
    }),
    /https key/i,
  )

  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: '3000',
      httpsKey: '/tmp/dev.key',
    }),
    /https cert/i,
  )
})

test('normalizeCliRuntimeConfig returns https and stt configuration when fully specified', () => {
  const config = normalizeCliRuntimeConfig({
    port: '3443',
    host: '192.168.1.2',
    password: false,
    httpsCert: '/tmp/dev.pem',
    httpsKey: '/tmp/dev.key',
    sttCommand: '/usr/local/bin/whisper-cli',
    sttModel: '/models/ggml-base.bin',
    sttLanguage: 'zh',
    sttTimeoutMs: '45000',
  })

  assert.equal(config.port, 3443)
  assert.equal(config.host, '192.168.1.2')
  assert.equal(config.https?.cert, '/tmp/dev.pem')
  assert.equal(config.https?.key, '/tmp/dev.key')
  assert.equal(config.transcription?.command, '/usr/local/bin/whisper-cli')
  assert.equal(config.transcription?.model, '/models/ggml-base.bin')
  assert.equal(config.transcription?.language, 'zh')
  assert.equal(config.transcription?.timeoutMs, 45000)
})

test('formatAccessUrl uses https scheme when tls is enabled', () => {
  assert.equal(formatAccessUrl('192.168.1.2', 3443, true), 'https://192.168.1.2:3443')
  assert.equal(formatAccessUrl(undefined, 3000, false), 'http://localhost:3000')
})
