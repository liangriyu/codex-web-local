import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('bridge exposes a host-browser private rpc for mobile account auth fallback', async () => {
  const bridge = await read('../src/server/codexAppServerBridge.ts')

  assert.match(bridge, /web-local\/browser\/open/)
  assert.match(bridge, /handlePrivateRpc/)
  assert.match(bridge, /openUrlInHostBrowser|handleBrowserOpenPrivateRpc/)
  assert.match(bridge, /execFile\('open'|execFile\('xdg-open'|execFile\('cmd'/)
})
