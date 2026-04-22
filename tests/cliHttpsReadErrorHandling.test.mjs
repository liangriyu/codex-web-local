import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('CLI wraps HTTPS cert/key read failures with actionable messages', async () => {
  const source = await readFile(new URL('../src/cli/index.ts', import.meta.url), 'utf8')

  assert.match(source, /function readHttpsFile\(path: string, kind: 'certificate' \| 'private key'\): Buffer/)
  assert.match(source, /Failed to read HTTPS \$\{kind\} file at "\$\{path\}"\./)
  assert.match(source, /Please verify the path, file permissions, and PEM format\./)
  assert.match(source, /cert: readHttpsFile\(runtimeConfig\.https\.cert, 'certificate'\)/)
  assert.match(source, /key: readHttpsFile\(runtimeConfig\.https\.key, 'private key'\)/)
})
