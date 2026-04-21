import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('bridge exposes web-local account private rpc methods', async () => {
  const bridge = await read('../src/server/codexAppServerBridge.ts')

  assert.match(bridge, /web-local\/account\/profiles\/list/)
  assert.match(bridge, /web-local\/account\/profiles\/switch/)
  assert.match(bridge, /web-local\/account\/profiles\/add/)
  assert.match(bridge, /web-local\/account\/profiles\/remove/)
  assert.match(bridge, /handlePrivateRpc/)
  assert.match(bridge, /accountSwitchCoordinator\.switchTo/)
  assert.match(bridge, /onSwitched:\s*async \(result\)/)
  assert.match(bridge, /reconcileAccountProfileStatusesAfterSwitch/)
  assert.match(bridge, /upsertAccountProfile/)
  assert.match(bridge, /auth\.json/)
  assert.match(bridge, /access_token/)
  assert.match(bridge, /syncCurrentRuntimeAccountProfile/)
  assert.match(bridge, /method === 'account\/login\/start'/)
  assert.match(bridge, /loginType === 'chatgpt'/)
  assert.match(bridge, /syncCodexAuthFileWithActiveProfile/)
  assert.match(bridge, /syncCodexAuthFileWithActiveProfile\(result\.activeProfileId\)/)
  assert.match(bridge, /managedTokenPayload/)
  assert.match(bridge, /auth_mode:\s*'chatgpt'/)
  assert.match(bridge, /auth_mode:\s*'chatgptAuthTokens'/)
  assert.match(bridge, /last_refresh/)
  assert.match(bridge, /capabilities:\s*\{/)
  assert.match(bridge, /experimentalApi:\s*true/)
  assert.match(bridge, /this\.call\('account\/read'/)
  assert.match(bridge, /tokenState:\s*'missing'/)
  assert.match(bridge, /profileId:\s*`current:/)
  assert.match(bridge, /Active account profile cannot be removed/)
  assert.match(bridge, /requires experimentalApi capability/)
  assert.match(bridge, /不支持免授权切换/)
})
