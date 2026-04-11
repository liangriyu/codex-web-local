import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('codex gateway exposes account center rpc helpers', async () => {
  const gateway = await read('../src/api/codexGateway.ts')

  assert.match(gateway, /export async function getAccountStatus\(/)
  assert.match(gateway, /export async function startAccountLogin\(/)
  assert.match(gateway, /export async function cancelAccountLogin\(/)
  assert.match(gateway, /export async function logoutAccount\(/)
  assert.match(gateway, /export async function refreshAccountStatus\(/)
  assert.match(gateway, /export async function openUrlInHostBrowser\(/)

  assert.match(gateway, /callRpc<[^>]+>\('account\/read'/)
  assert.match(gateway, /callRpc<[^>]+>\('account\/login\/start'/)
  assert.match(gateway, /callRpc<[^>]+>\('account\/login\/cancel'/)
  assert.match(gateway, /callRpc\('account\/logout'/)
  assert.match(gateway, /callRpc<[^>]+>\('web-local\/browser\/open'/)
})

test('account center state consumes account notifications', async () => {
  const state = await read('../src/composables/useAccountCenterState.ts')

  assert.match(state, /account\/updated/)
  assert.match(state, /account\/login\/completed/)
  assert.match(state, /account\/rateLimits\/updated/)
  assert.match(state, /export function useAccountCenterState\(/)
  assert.match(state, /isLoopbackUrl\(/)
  assert.match(state, /openPendingAuthPageOnHost\(/)
  assert.match(state, /localhost|127\.0\.0\.1/)
})

test('app mounts account center entry and sheet', async () => {
  const app = await read('../src/App.vue')

  assert.match(app, /AccountCenterSheet/)
  assert.match(app, /useAccountCenterState/)
  assert.match(app, /sidebar-account-button/)
  assert.match(app, /mobile-account-button/)
})
