import assert from 'node:assert/strict'
import test from 'node:test'

import { formatAccessUrl, normalizeCliRuntimeConfig } from '../src/cli/runtimeConfig.ts'

test('normalizeCliRuntimeConfig rejects partial https configuration', () => {
  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: '3000',
      password: false,
      httpsCert: '/tmp/dev.pem',
    }),
    /https key/i,
  )

  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: '3000',
      password: false,
      httpsKey: '/tmp/dev.key',
    }),
    /https cert/i,
  )
})

test('normalizeCliRuntimeConfig returns https configuration when fully specified', () => {
  const config = normalizeCliRuntimeConfig({
    port: '3443',
    host: '192.168.1.2',
    password: false,
    httpsCert: '/tmp/dev.pem',
    httpsKey: '/tmp/dev.key',
  })

  assert.equal(config.port, 3443)
  assert.equal(config.host, '192.168.1.2')
  assert.equal(config.https?.cert, '/tmp/dev.pem')
  assert.equal(config.https?.key, '/tmp/dev.key')
  assert.equal(config.voiceInputFallback.enabled, false)
})

test('normalizeCliRuntimeConfig rejects invalid port values', () => {
  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: 'abc',
      password: false,
    }),
    /invalid port/i,
  )

  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: '70000',
      password: false,
    }),
    /invalid port/i,
  )

  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: '123.45',
      password: false,
    }),
    /invalid port/i,
  )

  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: '   ',
      password: false,
    }),
    /invalid port/i,
  )

  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: undefined,
      password: false,
    }),
    /invalid port/i,
  )
})

test('formatAccessUrl uses https scheme when tls is enabled', () => {
  assert.equal(formatAccessUrl('192.168.1.2', 3443, true), 'https://192.168.1.2:3443')
  assert.equal(formatAccessUrl(undefined, 3000, false), 'http://localhost:3000')
})

test('normalizeCliRuntimeConfig enables openai voice fallback only when flag and key are both present', () => {
  const disabledByMissingFlag = normalizeCliRuntimeConfig({
    port: '3000',
    password: false,
  }, {
    OPENAI_API_KEY: 'sk-test',
  })
  assert.equal(disabledByMissingFlag.voiceInputFallback.enabled, false)

  const disabledByMissingKey = normalizeCliRuntimeConfig({
    port: '3000',
    password: false,
  }, {
    CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED: '1',
  })
  assert.equal(disabledByMissingKey.voiceInputFallback.enabled, false)

  const enabled = normalizeCliRuntimeConfig({
    port: '3000',
    password: false,
  }, {
    OPENAI_API_KEY: 'sk-test',
    CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED: '1',
  })
  assert.equal(enabled.voiceInputFallback.enabled, true)
  assert.equal(enabled.voiceInputFallback.apiKey, 'sk-test')
  assert.equal(enabled.voiceInputFallback.provider, 'openai')
  assert.equal(enabled.voiceInputFallback.model, 'gpt-4o-mini-transcribe')
})

test('normalizeCliRuntimeConfig supports zhipu voice fallback provider selection', () => {
  const disabledByMissingFlag = normalizeCliRuntimeConfig({
    port: '3000',
    password: false,
  }, {
    CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER: 'zhipu',
    ZHIPU_API_KEY: 'zhipu-test',
  })
  assert.equal(disabledByMissingFlag.voiceInputFallback.enabled, false)
  assert.equal(disabledByMissingFlag.voiceInputFallback.provider, 'zhipu')

  const disabledByMissingKey = normalizeCliRuntimeConfig({
    port: '3000',
    password: false,
  }, {
    CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER: 'zhipu',
    CODEX_WEB_LOCAL_ZHIPU_TRANSCRIBE_ENABLED: '1',
  })
  assert.equal(disabledByMissingKey.voiceInputFallback.enabled, false)
  assert.equal(disabledByMissingKey.voiceInputFallback.provider, 'zhipu')

  const enabled = normalizeCliRuntimeConfig({
    port: '3000',
    password: false,
  }, {
    CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER: 'zhipu',
    CODEX_WEB_LOCAL_ZHIPU_TRANSCRIBE_ENABLED: '1',
    ZHIPU_API_KEY: 'zhipu-test',
  })
  assert.equal(enabled.voiceInputFallback.enabled, true)
  assert.equal(enabled.voiceInputFallback.provider, 'zhipu')
  assert.equal(enabled.voiceInputFallback.apiKey, 'zhipu-test')
  assert.equal(enabled.voiceInputFallback.model, 'glm-asr-2512')
})
