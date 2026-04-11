import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildMobileAuthRelayUrl,
  MobileAuthSessionStore,
  normalizePublicBaseUrl,
  rewriteAuthUrlForMobileCallback,
} from '../src/server/mobileAuthSessionStore.ts'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('normalizePublicBaseUrl only accepts absolute https URLs and trims trailing slash', () => {
  assert.equal(normalizePublicBaseUrl('https://codex.landycode.online/'), 'https://codex.landycode.online')
  assert.equal(normalizePublicBaseUrl('https://codex.landycode.online/path/'), 'https://codex.landycode.online/path')
  assert.equal(normalizePublicBaseUrl('http://codex.landycode.online'), null)
  assert.equal(normalizePublicBaseUrl('/relative/path'), null)
  assert.equal(normalizePublicBaseUrl(''), null)
})

test('rewriteAuthUrlForMobileCallback swaps the loopback callback for the public callback', () => {
  const rewritten = rewriteAuthUrlForMobileCallback(
    'https://auth.openai.com/oauth/authorize?client_id=client-1&state=state-123&redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fcallback',
    'https://codex.landycode.online',
  )

  assert.equal(rewritten.state, 'state-123')
  assert.equal(rewritten.originalCallbackUrl, 'http://127.0.0.1:1455/callback')

  const parsed = new URL(rewritten.authUrl)
  assert.equal(parsed.searchParams.get('state'), 'state-123')
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://codex.landycode.online/auth/chatgpt/callback')
})

test('buildMobileAuthRelayUrl forwards callback query parameters back to the original loopback callback', () => {
  const relayUrl = buildMobileAuthRelayUrl(
    'http://127.0.0.1:1455/callback?client_id=client-1',
    new URL('https://codex.landycode.online/auth/chatgpt/callback?code=abc&state=state-123'),
  )

  const parsed = new URL(relayUrl)
  assert.equal(parsed.origin, 'http://127.0.0.1:1455')
  assert.equal(parsed.pathname, '/callback')
  assert.equal(parsed.searchParams.get('client_id'), 'client-1')
  assert.equal(parsed.searchParams.get('code'), 'abc')
  assert.equal(parsed.searchParams.get('state'), 'state-123')
})

test('mobile auth session store tracks pending, success, expired, and public url change states', () => {
  const store = new MobileAuthSessionStore({ ttlMs: 1_000 })

  const session = store.create({
    appServerLoginId: 'login-1',
    state: 'state-123',
    originalCallbackUrl: 'http://127.0.0.1:1455/callback',
    publicBaseUrlSnapshot: 'https://codex.landycode.online',
    nowMs: 1_000,
  })

  assert.equal(store.readStatus(session.loginSessionId, 'https://codex.landycode.online', 1_500)?.status, 'pending')
  assert.equal(store.readStatus(session.loginSessionId, 'https://changed.landycode.online', 1_500)?.status, 'public_url_changed')

  store.markSuccessByState('state-123')
  assert.equal(store.readStatus(session.loginSessionId, 'https://codex.landycode.online', 1_500)?.status, 'success')

  const expired = store.create({
    appServerLoginId: 'login-2',
    state: 'state-456',
    originalCallbackUrl: 'http://127.0.0.1:1455/callback',
    publicBaseUrlSnapshot: 'https://codex.landycode.online',
    nowMs: 2_000,
  })
  assert.equal(store.readStatus(expired.loginSessionId, 'https://codex.landycode.online', 3_500)?.status, 'expired')
})

test('mobile auth session store reports callback failures and unknown sessions separately', () => {
  const store = new MobileAuthSessionStore({ ttlMs: 60_000 })
  const session = store.create({
    appServerLoginId: 'login-3',
    state: 'state-fail',
    originalCallbackUrl: 'http://127.0.0.1:1455/callback',
    publicBaseUrlSnapshot: 'https://codex.landycode.online',
    nowMs: 100,
  })

  store.markFailedByState('state-fail', 'User cancelled authorization')

  const failed = store.readStatus(session.loginSessionId, 'https://codex.landycode.online', 200)
  assert.equal(failed?.status, 'failed')
  assert.equal(failed?.error, 'User cancelled authorization')
  assert.equal(store.readStatus('missing-session', 'https://codex.landycode.online', 200), null)
})

test('bridge exposes mobile direct auth routes and config capability keys', async () => {
  const bridge = await read('../src/server/codexAppServerBridge.ts')

  assert.match(bridge, /\/api\/auth\/chatgpt\/mobile\/start/)
  assert.match(bridge, /\/api\/auth\/chatgpt\/mobile\/status/)
  assert.match(bridge, /\/auth\/chatgpt\/callback/)
  assert.match(bridge, /codex_web_local_mobile_direct_auth_available/)
  assert.match(bridge, /codex_web_local_public_base_url/)
})
