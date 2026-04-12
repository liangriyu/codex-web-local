import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/composables/useAccountCenterState.ts', import.meta.url), 'utf8')

test('refresh bootstrap does not couple account status with rate limits RPC', () => {
  assert.doesNotMatch(
    source,
    /Promise\.all\(\s*\[\s*accountReader\(\)\s*,\s*readCodexConfig\(\)\s*,\s*getAccountRateLimitSnapshot\(\)\s*,?\s*\]\s*\)/,
  )

  assert.match(
    source,
    /if\s*\(accountSnapshot\.account\)\s*\{[\s\S]*?await\s+refreshRateLimits\(\)[\s\S]*?\}\s*else\s*\{[\s\S]*?rateLimitSnapshot\.value\s*=\s*null/,
  )
})
