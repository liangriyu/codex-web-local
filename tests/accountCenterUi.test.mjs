import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('codex gateway exposes account center rpc helpers and profile apis', async () => {
  const gateway = await read('../src/api/codexGateway.ts')

  assert.match(gateway, /export async function getAccountStatus\(/)
  assert.match(gateway, /export async function getServerConnectionState\(/)
  assert.match(gateway, /export async function startAccountLogin\(/)
  assert.match(gateway, /export async function cancelAccountLogin\(/)
  assert.match(gateway, /export async function logoutAccount\(/)
  assert.match(gateway, /export async function refreshAccountStatus\(/)
  assert.match(gateway, /export async function openUrlInHostBrowser\(/)
  assert.match(gateway, /export async function listAccountProfiles\(/)
  assert.match(gateway, /export async function createAccountProfile\(/)
  assert.match(gateway, /export async function switchAccountProfile\(/)

  assert.match(gateway, /callRpc<[^>]+>\('account\/read'/)
  assert.match(gateway, /callRpc<[^>]+>\('account\/login\/start'/)
  assert.match(gateway, /callRpc<[^>]+>\('account\/login\/cancel'/)
  assert.match(gateway, /callRpc\('account\/logout'/)
  assert.match(gateway, /callRpc<[^>]+>\('web-local\/browser\/open'/)
  assert.match(gateway, /\/codex-api\/account-profiles/)
  assert.match(gateway, /\/codex-api\/account-profiles\/switch/)
  assert.match(gateway, /\/codex-api\/server-connection/)

  assert.doesNotMatch(gateway, /startMobileChatgptLogin/)
  assert.doesNotMatch(gateway, /getMobileChatgptLoginStatus/)
})

test('account center state supports profile switching and desktop-only auth actions', async () => {
  const state = await read('../src/composables/useAccountCenterState.ts')

  assert.match(state, /account\/updated/)
  assert.match(state, /account\/login\/completed/)
  assert.match(state, /account\/rateLimits\/updated/)
  assert.match(state, /export function useAccountCenterState\(/)
  assert.match(state, /accountProfiles/)
  assert.match(state, /activeProfileId/)
  assert.match(state, /serverConnectionMode/)
  assert.match(state, /serverConnectionStatus/)
  assert.match(state, /serverConnectionError/)
  assert.match(state, /getServerConnectionState\(/)
  assert.match(state, /supportsAccountProfiles/)
  assert.match(state, /serverConnectionMode\.value === 'isolated'/)
  assert.match(state, /switchToAccountProfile\(/)
  assert.match(state, /createAndSwitchAccountProfile\(/)
  assert.match(state, /window\.matchMedia/)
  assert.match(state, /手机端不支持授权登录/)

  assert.doesNotMatch(state, /startMobileChatgptLogin/)
  assert.doesNotMatch(state, /getMobileChatgptLoginStatus/)
  assert.doesNotMatch(state, /public_url_changed|server_restarted|expired/)
})

test('app mounts account center sheet with profile switching actions', async () => {
  const [app, sheet, overview, picker, uiText] = await Promise.all([
    read('../src/App.vue'),
    read('../src/components/account/AccountCenterSheet.vue'),
    read('../src/components/account/AccountOverviewCard.vue'),
    read('../src/components/account/AccountLoginMethodPicker.vue'),
    read('../src/i18n/uiText.ts'),
  ])

  assert.match(app, /AccountCenterSheet/)
  assert.match(app, /useAccountCenterState/)
  assert.match(app, /sidebar-account-button/)
  assert.match(app, /mobile-account-button/)
  assert.match(app, /function onStartChatgptLoginNewProfile\(\): void/)
  assert.match(app, /async function onSwitchAccountProfile\(profileId: string\): Promise<void>/)
  assert.match(app, /await switchToAccountProfile\(profileId\)/)
  assert.match(app, /resetSessionViewStateForProfileSwitch\(\)/)
  assert.match(app, /await refreshAll\(\)/)
  assert.match(app, /content-runtime-hint/)
  assert.match(app, /共享模式连接失败，当前未进入强共享/)
  assert.match(app, /共享模式 · 已连接共享 app-server/)
  assert.match(app, /独立模式/)
  assert.match(app, /:server-connection-mode="serverConnectionMode"/)
  assert.match(app, /@start-chatgpt-login-new-profile=/)
  assert.match(app, /@switch-profile=/)
  assert.match(sheet, /serverConnectionMode: UiServerConnectionMode/)
  assert.match(overview, /serverConnectionMode: UiServerConnectionMode/)
  assert.match(overview, /const showProfileList = computed\(\(\) => props\.serverConnectionMode === 'isolated'/)
  assert.match(overview, /sharedCodexAppHint/)
  assert.match(picker, /serverConnectionMode: UiServerConnectionMode/)
  assert.match(picker, /canCreateProfileDuringLogin/)
  assert.match(picker, /props\.serverConnectionMode === 'isolated'/)
  assert.match(uiText, /'app\.accountCenterSharedModeHint'/)

  assert.doesNotMatch(app, /mobileDirectAuthAvailable\.value/)
})
