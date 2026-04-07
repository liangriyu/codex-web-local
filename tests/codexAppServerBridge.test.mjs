import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import { createCodexBridgeMiddleware } from '../src/server/codexAppServerBridge.ts'

const execFileAsync = promisify(execFile)

function createDeferred() {
  let resolve
  const promise = new Promise((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

function createResponseCapture() {
  const headers = {}
  let body = ''
  return {
    headers,
    statusCode: 0,
    writableEnded: false,
    destroyed: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value
    },
    end(chunk) {
      if (typeof chunk === 'string') {
        body += chunk
      } else if (chunk) {
        body += Buffer.from(chunk).toString('utf8')
      }
      this.writableEnded = true
    },
    get body() {
      return body
    },
  }
}

function createJsonRequest(method, url, body) {
  const payload = JSON.stringify(body)
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload, 'utf8')
    },
  }
}

async function runGit(cwd, args, options = {}) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Codex Test',
    GIT_AUTHOR_EMAIL: 'codex@example.com',
    GIT_COMMITTER_NAME: 'Codex Test',
    GIT_COMMITTER_EMAIL: 'codex@example.com',
    ...(options.env ?? {}),
  }
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env,
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout
}

async function createBareRemoteWorkspace() {
  const rootDir = await mkdtemp(join(tmpdir(), 'codex-web-local-push-remote-'))
  const remoteDir = join(rootDir, 'remote.git')
  const repoDir = join(rootDir, 'repo')

  await runGit(rootDir, ['init', '--bare', remoteDir])
  await runGit(rootDir, ['init', repoDir])
  await runGit(repoDir, ['config', 'user.name', 'Codex Test'])
  await runGit(repoDir, ['config', 'user.email', 'codex@example.com'])
  await writeFile(join(repoDir, 'README.md'), 'initial\n')
  await runGit(repoDir, ['add', 'README.md'])
  await runGit(repoDir, ['commit', '-m', 'initial commit'])
  await runGit(repoDir, ['branch', '-M', 'main'])
  await runGit(repoDir, ['remote', 'add', 'origin', remoteDir])
  await runGit(repoDir, ['push', '-u', 'origin', 'main'])

  return { rootDir, remoteDir, repoDir }
}

async function invokeMiddleware(middleware, method, url, body = undefined) {
  const req = body === undefined
    ? { method, url }
    : createJsonRequest(method, url, body)
  const res = createResponseCapture()
  await middleware(req, res, () => {
    throw new Error(`unexpected fallthrough for ${method} ${url}`)
  })
  return res
}

function parseBody(res) {
  assert.match(res.headers['content-type'] ?? '', /application\/json/)
  return JSON.parse(res.body)
}

async function withFreshBridge(fn) {
  const previousCodexHome = process.env.CODEX_HOME
  const globalScope = globalThis
  const previousSharedBridge = globalScope.__codexRemoteSharedBridge__
  delete globalScope.__codexRemoteSharedBridge__

  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-bridge-'))
  process.env.CODEX_HOME = tempCodexHome
  const middleware = createCodexBridgeMiddleware()

  try {
    await fn({ middleware, tempCodexHome })
  } finally {
    middleware.dispose()
    delete globalScope.__codexRemoteSharedBridge__
    if (previousSharedBridge) {
      globalScope.__codexRemoteSharedBridge__ = previousSharedBridge
    }
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
}

test('git push status reports upstream metadata and push succeeds', async () => {
  const { rootDir, repoDir } = await createBareRemoteWorkspace()

  await withFreshBridge(async ({ middleware }) => {
    await writeFile(join(repoDir, 'feature.txt'), 'feature one\n')
    await runGit(repoDir, ['add', 'feature.txt'])
    await runGit(repoDir, ['commit', '-m', 'feature work'])

    const statusRes = await invokeMiddleware(
      middleware,
      'GET',
      `/codex-api/git/push/status?cwd=${encodeURIComponent(repoDir)}`,
    )
    assert.equal(statusRes.statusCode, 200)
    const statusBody = parseBody(statusRes)
    assert.equal(statusBody.cwd, repoDir)
    assert.equal(statusBody.isRepo, true)
    assert.equal(statusBody.currentBranch, 'main')
    assert.equal(statusBody.hasUpstream, true)
    assert.equal(statusBody.upstreamRemote, 'origin')
    assert.equal(statusBody.upstreamBranch, 'main')
    assert.equal(statusBody.aheadCount, 1)
    assert.equal(statusBody.behindCount, 0)
    assert.equal(statusBody.hasCommitsToPush, true)
    assert.equal(statusBody.canPush, true)
    assert.deepEqual(statusBody.blockedReasons, [])

    const pushRes = await invokeMiddleware(
      middleware,
      'POST',
      '/codex-api/git/push',
      { cwd: repoDir },
    )
    assert.equal(pushRes.statusCode, 200)
    const pushBody = parseBody(pushRes)
    assert.equal(pushBody.ok, true)
    assert.equal(pushBody.currentBranch, 'main')
    assert.equal(pushBody.upstreamRemote, 'origin')
    assert.equal(pushBody.upstreamBranch, 'main')

    const afterPushRes = await invokeMiddleware(
      middleware,
      'GET',
      `/codex-api/git/push/status?cwd=${encodeURIComponent(repoDir)}`,
    )
    assert.equal(afterPushRes.statusCode, 200)
    const afterPushBody = parseBody(afterPushRes)
    assert.equal(afterPushBody.aheadCount, 0)
    assert.equal(afterPushBody.hasCommitsToPush, false)
    assert.equal(afterPushBody.canPush, false)
  })

  await rm(rootDir, { recursive: true, force: true })
})

test('git push status allows first push when the current branch has no upstream', async () => {
  const { rootDir, repoDir } = await createBareRemoteWorkspace()

  await withFreshBridge(async ({ middleware }) => {
    await runGit(repoDir, ['switch', '-c', 'feature/no-upstream'])
    await writeFile(join(repoDir, 'feature-no-upstream.txt'), 'feature branch\n')
    await runGit(repoDir, ['add', 'feature-no-upstream.txt'])
    await runGit(repoDir, ['commit', '-m', 'feature without upstream'])

    const statusRes = await invokeMiddleware(
      middleware,
      'GET',
      `/codex-api/git/push/status?cwd=${encodeURIComponent(repoDir)}`,
    )
    assert.equal(statusRes.statusCode, 200)
    const statusBody = parseBody(statusRes)
    assert.equal(statusBody.currentBranch, 'feature/no-upstream')
    assert.equal(statusBody.hasUpstream, false)
    assert.equal(statusBody.canPush, true)
    assert.equal(statusBody.hasCommitsToPush, true)
    assert.equal(statusBody.willSetUpstream, true)
    assert.match(statusBody.suggestedUpstreamCommand, /git push --set-upstream origin feature\/no-upstream/)

    const pushRes = await invokeMiddleware(
      middleware,
      'POST',
      '/codex-api/git/push',
      { cwd: repoDir },
    )
    assert.equal(pushRes.statusCode, 200)
    const pushBody = parseBody(pushRes)
    assert.equal(pushBody.ok, true)
    assert.equal(pushBody.currentBranch, 'feature/no-upstream')
    assert.equal(pushBody.upstreamRemote, 'origin')
    assert.equal(pushBody.upstreamBranch, 'feature/no-upstream')
    assert.equal(pushBody.createdUpstream, true)

    const upstream = (await runGit(repoDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).trim()
    assert.equal(upstream, 'origin/feature/no-upstream')
  })

  await rm(rootDir, { recursive: true, force: true })
})

test('git push surfaces invalid upstream configuration instead of degrading to setup guidance', async () => {
  const { rootDir, repoDir } = await createBareRemoteWorkspace()

  await withFreshBridge(async ({ middleware }) => {
    await runGit(repoDir, ['config', 'branch.main.remote', 'origin'])
    await runGit(repoDir, ['config', 'branch.main.merge', 'refs/heads/missing-upstream'])

    const statusRes = await invokeMiddleware(
      middleware,
      'GET',
      `/codex-api/git/push/status?cwd=${encodeURIComponent(repoDir)}`,
    )
    assert.equal(statusRes.statusCode, 502)
    const statusBody = parseBody(statusRes)
    assert.match(statusBody.error, /upstream|remote-tracking branch|missing-upstream/i)
    assert.equal('suggestedUpstreamCommand' in statusBody, false)

    const pushRes = await invokeMiddleware(
      middleware,
      'POST',
      '/codex-api/git/push',
      { cwd: repoDir },
    )
    assert.equal(pushRes.statusCode, 400)
    const pushBody = parseBody(pushRes)
    assert.match(pushBody.error, /upstream|remote-tracking branch|missing-upstream/i)
    assert.equal('suggestedUpstreamCommand' in pushBody, false)
  })

  await rm(rootDir, { recursive: true, force: true })
})

test('git push is blocked when the workspace is dirty', async () => {
  const { rootDir, repoDir } = await createBareRemoteWorkspace()

  await withFreshBridge(async ({ middleware }) => {
    await writeFile(join(repoDir, 'dirty.txt'), 'dirty change\n')

    const pushRes = await invokeMiddleware(
      middleware,
      'POST',
      '/codex-api/git/push',
      { cwd: repoDir },
    )
    assert.equal(pushRes.statusCode, 409)
    const pushBody = parseBody(pushRes)
    assert.equal(pushBody.error, 'Workspace push is blocked by current workspace state')
    assert.ok(Array.isArray(pushBody.blockedReasons))
    assert.ok(pushBody.blockedReasons.includes('workspace_dirty'))
  })

  await rm(rootDir, { recursive: true, force: true })
})

test('thread latest reversible returns no_reversible_turn when the thread has no file change history', async () => {
  await withFreshBridge(async ({ middleware }) => {
    const appServer = globalThis.__codexRemoteSharedBridge__?.appServer
    assert.ok(appServer)
    appServer.rpc = async (_method, params) => {
      assert.equal(_method, 'thread/read')
      assert.equal(params?.threadId, 'thread-empty-1')
      return {
        thread: {
          id: 'thread-empty-1',
          cwd: '/tmp/thread-empty-1',
          path: '',
          turns: params?.includeTurns
            ? [{
              id: 'turn-1',
              status: 'completed',
              items: [{
                id: 'item-1',
                type: 'assistantMessage',
                text: 'plain reply',
              }],
            }]
            : [],
        },
      }
    }

    const latestRes = await invokeMiddleware(
      middleware,
      'GET',
      '/codex-api/thread-file-changes/latest-reversible?threadId=thread-empty-1',
    )
    assert.equal(latestRes.statusCode, 404)
    const latestBody = parseBody(latestRes)
    assert.equal(latestBody.error.code, 'no_reversible_turn')
    assert.match(latestBody.error.message, /no reversible/i)
  })
})

test('thread file changes timeline route aggregates same-turn session fallback entries', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'codex-web-local-thread-timeline-'))
  const sessionPath = join(rootDir, 'session.jsonl')
  await writeFile(sessionPath, [
    '{"type":"response_item","turnId":"turn-1","createdAt":"2026-04-07T10:00:01.000Z","item":{"type":"custom_tool_call","name":"apply_patch","arguments":"*** Begin Patch\\n*** Update File: src/a.ts\\n@@\\n-old\\n+new\\n*** End Patch"}}',
    '{"type":"response_item","turnId":"turn-1","createdAt":"2026-04-07T10:00:02.000Z","item":{"type":"custom_tool_call","name":"apply_patch","arguments":"*** Begin Patch\\n*** Update File: src/b.ts\\n@@\\n-before\\n+after\\n*** End Patch"}}',
  ].join('\n'))

  await withFreshBridge(async ({ middleware }) => {
    const appServer = globalThis.__codexRemoteSharedBridge__?.appServer
    assert.ok(appServer)
    appServer.rpc = async (_method, params) => {
      assert.equal(_method, 'thread/read')
      assert.equal(params?.threadId, 'thread-fallback-1')
      return {
        thread: {
          id: 'thread-fallback-1',
          cwd: rootDir,
          path: sessionPath,
          turns: [],
        },
      }
    }

    const timelineRes = await invokeMiddleware(
      middleware,
      'GET',
      '/codex-api/thread-file-changes/timeline?threadId=thread-fallback-1',
    )
    assert.equal(timelineRes.statusCode, 200)
    const timelineBody = parseBody(timelineRes)
    assert.equal(timelineBody.data.threadId, 'thread-fallback-1')
    assert.equal(timelineBody.data.records.length, 1)
    assert.deepEqual(
      timelineBody.data.records[0].files.map((file) => file.path),
      ['src/a.ts', 'src/b.ts'],
    )
  })

  await rm(rootDir, { recursive: true, force: true })
})

test('thread file changes timeline route merges thread/read timeline with older session fallback history', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'codex-web-local-thread-history-'))
  const sessionPath = join(rootDir, 'session.jsonl')
  await writeFile(sessionPath, [
    '{"type":"response_item","turnId":"turn-1","createdAt":"2026-04-07T10:00:01.000Z","item":{"type":"custom_tool_call","name":"apply_patch","arguments":"*** Begin Patch\\n*** Update File: src/older.ts\\n@@\\n-old\\n+older\\n*** End Patch"}}',
  ].join('\n'))

  await withFreshBridge(async ({ middleware }) => {
    const appServer = globalThis.__codexRemoteSharedBridge__?.appServer
    assert.ok(appServer)
    appServer.rpc = async (_method, params) => {
      assert.equal(_method, 'thread/read')
      assert.equal(params?.threadId, 'thread-history-1')
      return {
        thread: {
          id: 'thread-history-1',
          cwd: rootDir,
          path: sessionPath,
          turns: params?.includeTurns
            ? [{
              id: 'turn-2',
              status: 'completed',
              items: [{
                id: 'item-1',
                type: 'fileChange',
                status: 'completed',
                changes: [{
                  path: 'src/latest.ts',
                  diff: 'diff --git a/src/latest.ts b/src/latest.ts\n--- a/src/latest.ts\n+++ b/src/latest.ts\n@@ -1 +1 @@\n-old\n+latest\n',
                }],
              }],
            }]
            : [],
        },
      }
    }

    const timelineRes = await invokeMiddleware(
      middleware,
      'GET',
      '/codex-api/thread-file-changes/timeline?threadId=thread-history-1',
    )
    assert.equal(timelineRes.statusCode, 200)
    const timelineBody = parseBody(timelineRes)
    assert.deepEqual(
      timelineBody.data.records.map((record) => record.turnId),
      ['turn-1', 'turn-2'],
    )
    assert.deepEqual(
      timelineBody.data.records[0].files.map((file) => file.path),
      ['src/older.ts'],
    )
    assert.deepEqual(
      timelineBody.data.records[1].files.map((file) => file.path),
      ['src/latest.ts'],
    )
  })

  await rm(rootDir, { recursive: true, force: true })
})

test('undo-latest rejects a dirty workspace with workspace_not_clean', async () => {
  const { rootDir, repoDir } = await createBareRemoteWorkspace()

  await withFreshBridge(async ({ middleware }) => {
    await writeFile(join(repoDir, 'dirty.txt'), 'dirty change\n')

    const appServer = globalThis.__codexRemoteSharedBridge__?.appServer
    assert.ok(appServer)
    appServer.rpc = async (_method, params) => {
      assert.equal(_method, 'thread/read')
      assert.equal(params?.threadId, 'thread-dirty-1')
      return {
        thread: {
          id: 'thread-dirty-1',
          cwd: repoDir,
          path: '',
          turns: params?.includeTurns
            ? [{
              id: 'turn-1',
              status: 'completed',
              items: [{
                id: 'item-1',
                type: 'fileChange',
                status: 'completed',
                changes: [{
                  path: 'dirty.txt',
                  diff: 'diff --git a/dirty.txt b/dirty.txt\n--- a/dirty.txt\n+++ b/dirty.txt\n@@ -1 +1 @@\n-before\n+after\n',
                }],
              }],
            }]
            : [],
        },
      }
    }

    const undoRes = await invokeMiddleware(
      middleware,
      'POST',
      '/codex-api/thread-file-changes/undo-latest',
      { threadId: 'thread-dirty-1' },
    )
    assert.equal(undoRes.statusCode, 409)
    const undoBody = parseBody(undoRes)
    assert.equal(undoBody.error.code, 'workspace_not_clean')
    assert.match(undoBody.error.message, /workspace/i)
  })

  await rm(rootDir, { recursive: true, force: true })
})

test('reapply-latest rejects a conflicting patch with patch_conflict', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'codex-web-local-thread-conflict-'))
  const repoDir = join(rootDir, 'repo')
  await runGit(rootDir, ['init', repoDir])
  await runGit(repoDir, ['config', 'user.name', 'Codex Test'])
  await runGit(repoDir, ['config', 'user.email', 'codex@example.com'])
  await writeFile(join(repoDir, 'demo.txt'), 'alpha\nbeta\ngamma\n')
  await runGit(repoDir, ['add', 'demo.txt'])
  await runGit(repoDir, ['commit', '-m', 'initial'])
  await writeFile(join(repoDir, 'demo.txt'), 'alpha\nchanged\ngamma\n')
  const patch = await runGit(repoDir, ['diff'])
  await runGit(repoDir, ['checkout', '--', 'demo.txt'])
  await writeFile(join(repoDir, 'demo.txt'), 'alpha\nother\ngamma\n')
  await runGit(repoDir, ['add', 'demo.txt'])
  await runGit(repoDir, ['commit', '-m', 'conflicting follow-up'])

  await withFreshBridge(async ({ middleware }) => {
    const appServer = globalThis.__codexRemoteSharedBridge__?.appServer
    assert.ok(appServer)
    appServer.rpc = async (_method, params) => {
      assert.equal(_method, 'thread/read')
      assert.equal(params?.threadId, 'thread-conflict-1')
      return {
        thread: {
          id: 'thread-conflict-1',
          cwd: repoDir,
          path: '',
          turns: params?.includeTurns
            ? [{
              id: 'turn-1',
              status: 'completed',
              items: [{
                id: 'item-1',
                type: 'fileChange',
                status: 'completed',
                changes: [{
                  path: 'demo.txt',
                  diff: patch,
                }],
              }],
            }]
            : [],
        },
      }
    }

    const reapplyRes = await invokeMiddleware(
      middleware,
      'POST',
      '/codex-api/thread-file-changes/reapply-latest',
      { threadId: 'thread-conflict-1' },
    )
    assert.equal(reapplyRes.statusCode, 409)
    const reapplyBody = parseBody(reapplyRes)
    assert.equal(reapplyBody.error.code, 'patch_conflict')
    assert.match(reapplyBody.error.message, /apply|conflict/i)
  })

  await rm(rootDir, { recursive: true, force: true })
})

test('git push status reports a stable response outside a git repository', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'codex-web-local-push-remote-nonrepo-'))

  await withFreshBridge(async ({ middleware }) => {
    const statusRes = await invokeMiddleware(
      middleware,
      'GET',
      `/codex-api/git/push/status?cwd=${encodeURIComponent(rootDir)}`,
    )
    assert.equal(statusRes.statusCode, 200)
    const statusBody = parseBody(statusRes)
    assert.equal(statusBody.isRepo, false)
    assert.equal(statusBody.canPush, false)
    assert.ok(Array.isArray(statusBody.blockedReasons))
    assert.ok(statusBody.blockedReasons.includes('not_repo'))
  })

  await rm(rootDir, { recursive: true, force: true })
})

test('resolvePendingServerRequest waits for persisted fallback conversion before recording resolution', async () => {
  const previousCodexHome = process.env.CODEX_HOME
  const globalScope = globalThis
  const previousSharedBridge = globalScope.__codexRemoteSharedBridge__
  const tempCodexHome = await mkdtemp(join(tmpdir(), 'codex-web-local-server-request-test-'))

  process.env.CODEX_HOME = tempCodexHome
  delete globalScope.__codexRemoteSharedBridge__

  const middleware = createCodexBridgeMiddleware()
  const appServer = globalScope.__codexRemoteSharedBridge__?.appServer
  assert.ok(appServer, 'expected shared appServer instance')

  const persistedRecord = {
    id: 42,
    method: 'workspace/approve',
    threadId: '',
    turnId: '',
    itemId: '',
    cwd: '/tmp/workspace',
    params: { cwd: '/tmp/workspace' },
    receivedAtIso: '2026-04-02T12:00:00.000Z',
    resolvedAtIso: null,
    resolutionKind: null,
    dismissedAtIso: null,
    dismissedReason: null,
    dismissedBy: null,
  }
  const deferredPersisted = createDeferred()

  appServer.sendServerRequestReply = () => {}
  appServer.toPersistedServerRequest = () => deferredPersisted.promise

  try {
    appServer.handleServerRequest(
      persistedRecord.id,
      persistedRecord.method,
      persistedRecord.params,
    )
    appServer.resolvePendingServerRequest(persistedRecord.id, {
      result: { ok: true },
    })

    deferredPersisted.resolve(persistedRecord)

    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    await appServer.persistedServerRequestsFlushChain

    const ledgerPath = join(tempCodexHome, 'codex-web-local', 'persisted-server-requests.json')
    const ledgerRaw = await readFile(ledgerPath, 'utf8')
    const ledger = JSON.parse(ledgerRaw)
    const [request] = ledger.requests ?? []

    assert.equal(typeof request?.id, 'number')
    assert.equal(request?.id, persistedRecord.id)
    assert.equal(request?.method, persistedRecord.method)
    assert.equal(request?.receivedAtIso, persistedRecord.receivedAtIso)
    assert.equal(request?.cwd, persistedRecord.cwd)
    assert.equal(request?.resolutionKind, 'resolved')
    assert.equal(typeof request?.resolvedAtIso, 'string')
  } finally {
    middleware.dispose()
    delete globalScope.__codexRemoteSharedBridge__
    if (previousSharedBridge) {
      globalScope.__codexRemoteSharedBridge__ = previousSharedBridge
    }
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = previousCodexHome
    }
    await rm(tempCodexHome, { recursive: true, force: true })
  }
})
