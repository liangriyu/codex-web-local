import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('workspace push state is wired through types, gateway, desktop state, app, and composer', async () => {
  const types = await read('../src/types/codex.ts')
  const gateway = await read('../src/api/codexGateway.ts')
  const desktopState = await read('../src/composables/useDesktopState.ts')
  const app = await read('../src/App.vue')
  const composer = await read('../src/components/content/ThreadComposer.vue')
  const uiText = await read('../src/i18n/uiText.ts')

  assert.match(types, /export type UiWorkspacePushStatus = \{/)
  assert.match(types, /export type UiWorkspacePushResult = \{/)
  assert.match(types, /willSetUpstream: boolean/)
  assert.match(types, /createdUpstream: boolean/)
  assert.match(types, /export type WorkspacePushState = \{/)
  assert.match(types, /push: WorkspacePushState/)

  assert.match(gateway, /export async function fetchWorkspacePushStatus\(cwd: string\)/)
  assert.match(gateway, /export async function pushWorkspaceBranch\(cwd: string\)/)
  assert.match(gateway, /\/codex-api\/git\/push\/status/)
  assert.match(gateway, /\/codex-api\/git\/push/)

  assert.match(desktopState, /async function refreshWorkspacePushStatus\(/)
  assert.match(desktopState, /async function pushSelectedWorkspaceBranch\(\): Promise<boolean>/)
  assert.match(desktopState, /async function pushWorkspaceBranchForCwd\(cwd: string\): Promise<boolean>/)
  assert.match(desktopState, /push:\s*\{/)
  assert.match(desktopState, /fetchWorkspacePushStatus/)
  assert.match(desktopState, /pushWorkspaceBranch as pushWorkspaceBranchRequest/)

  assert.match(app, /pushSelectedWorkspaceBranch/)
  assert.match(app, /pushWorkspaceBranchForCwd/)
  assert.match(app, /@push-branch="onPushWorkspaceBranch"/)
  assert.match(app, /async function onPushWorkspaceBranch\(\): Promise<void>/)

  assert.match(composer, /'push-branch': \[\]/)
  assert.match(composer, /branchPushStatus/)
  assert.match(composer, /branchPushCommand/)
  assert.match(composer, /branchPushActionLabel/)
  assert.match(composer, /thread-composer-branch-push/)
  assert.match(composer, /thread-composer-branch-push-button/)
  assert.match(composer, /thread-composer-branch-push-command/)
  assert.match(composer, /status\.willSetUpstream === true/)

  assert.match(uiText, /'composer\.branchPushTitle'/)
  assert.match(uiText, /'composer\.branchPushLoading'/)
  assert.match(uiText, /'composer\.branchPushAction'/)
  assert.match(uiText, /'composer\.branchPushSetUpstreamAction'/)
  assert.match(uiText, /'composer\.branchPushing'/)
  assert.match(uiText, /'composer\.branchPushUpToDate'/)
  assert.match(uiText, /'composer\.branchPushMissingUpstream'/)
  assert.match(uiText, /'composer\.branchPushSuggestedCommand'/)
  assert.match(uiText, /'composer\.pushBlockedUnresolvedScope'/)
})
