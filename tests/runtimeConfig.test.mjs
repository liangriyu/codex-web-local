import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeCliRuntimeConfig } from '../src/cli/runtimeConfig.ts'

test('normalizeCliRuntimeConfig supports explicit shared and isolated server modes', () => {
  const sharedConfig = normalizeCliRuntimeConfig({
    port: '3000',
    password: false,
    serverMode: 'shared',
  })
  const isolatedConfig = normalizeCliRuntimeConfig({
    port: '3000',
    password: false,
    serverMode: 'isolated',
  })

  assert.equal(sharedConfig.serverMode, 'shared')
  assert.equal(isolatedConfig.serverMode, 'isolated')
})

test('normalizeCliRuntimeConfig defaults server mode to shared', () => {
  const config = normalizeCliRuntimeConfig({
    port: '3000',
    password: false,
  })

  assert.equal(config.serverMode, 'shared')
})

test('normalizeCliRuntimeConfig rejects unsupported server modes', () => {
  assert.throws(
    () => normalizeCliRuntimeConfig({
      port: '3000',
      password: false,
      serverMode: 'hybrid',
    }),
    /server mode/i,
  )
})
