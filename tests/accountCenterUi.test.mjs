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
  assert.match(state, /serverConnectionStatus\.value !== 'connected'/)
  assert.match(state, /serverConnectionStatus\.value !== 'running_without_shared_endpoint'/)
  assert.match(state, /未检测到可共享的 Codex\.app 运行时/)
  assert.match(state, /桌面版 Codex\.app 已启动，但当前未暴露可共享入口/)
  assert.match(state, /检测到桌面运行时，但连接共享运行时失败/)
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
  assert.match(app, /t\('app\.sharedModeUnavailableHint'\)/)
  assert.match(app, /t\('app\.sharedModeRunningWithoutEndpointHint'\)/)
  assert.match(app, /t\('app\.sharedModeAttachFailedHint'\)/)
  assert.match(app, /共享模式 · 已连接共享 app-server/)
  assert.match(app, /独立模式/)
  assert.match(app, /:server-connection-mode="serverConnectionMode"/)
  assert.match(app, /:server-connection-status="serverConnectionStatus"/)
  assert.match(app, /@start-chatgpt-login-new-profile=/)
  assert.match(app, /@switch-profile=/)
  assert.match(app, /@switch-to-isolated=/)
  assert.match(sheet, /serverConnectionMode: UiServerConnectionMode/)
  assert.match(sheet, /serverConnectionStatus: UiServerConnectionStatus/)
  assert.match(overview, /serverConnectionMode: UiServerConnectionMode/)
  assert.match(overview, /serverConnectionStatus: UiServerConnectionStatus/)
  assert.match(overview, /const showProfileList = computed\(\(\) => props\.serverConnectionMode === 'isolated'/)
  assert.match(overview, /const showSwitchToIsolatedAction = computed\(\(\) =>/)
  assert.match(overview, /switch-to-isolated/)
  assert.match(overview, /sharedCodexAppHint/)
  assert.match(picker, /serverConnectionMode: UiServerConnectionMode/)
  assert.match(picker, /canCreateProfileDuringLogin/)
  assert.match(picker, /props\.serverConnectionMode === 'isolated'/)
  assert.match(uiText, /'app\.accountCenterSharedModeHint'/)
  assert.match(uiText, /'app\.sharedModeUnavailableHint'/)
  assert.match(uiText, /'app\.sharedModeRunningWithoutEndpointHint'/)
  assert.match(uiText, /'app\.sharedModeAttachFailedHint'/)
  assert.match(uiText, /'app\.sharedModeSwitchToIsolated'/)

  assert.doesNotMatch(app, /mobileDirectAuthAvailable\.value/)
})
