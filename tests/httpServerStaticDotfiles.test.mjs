import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('http server allows serving built assets when the workspace lives under a hidden .worktrees parent', async () => {
  const source = await read('../src/server/httpServer.ts')

  assert.match(
    source,
    /express\.static\(distDir,\s*\{[\s\S]*dotfiles:\s*'allow'[\s\S]*\}\)/,
  )
  assert.match(
    source,
    /res\.sendFile\(join\(distDir,\s*'index\.html'\),\s*\{[\s\S]*dotfiles:\s*'allow'[\s\S]*\}\)/,
  )
})
