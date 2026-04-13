import { computed, ref } from 'vue'
import {
  cancelAccountLogin,
  createAccountProfile,
  getAccountRateLimitSnapshot,
  getAccountStatus,
  listAccountProfiles,
  logoutAccount,
  openUrlInHostBrowser,
  readCodexConfig,
  refreshAccountStatus,
  startAccountLogin,
  subscribeCodexNotifications,
  switchAccountProfile,
  type AccountRateLimitSnapshot,
  type RpcNotification,
} from '../api/codexGateway'
import type {
  UiAccount,
  UiAccountAuthMode,
  UiAccountCenterView,
  UiAccountLoginFlow,
  UiAccountProfile,
  UiAccountStatus,
  UiForcedLoginMethod,
} from '../types/codex'

function normalizeAccountAuthMode(value: unknown): UiAccountAuthMode | null {
  if (value === 'apikey') return 'apiKey'
  if (value === 'chatgpt' || value === 'chatgptAuthTokens') {
    return value
  }
  return null
}

function readLoginCompleted(notification: RpcNotification): {
  loginId: string | null
  success: boolean
  error: string | null
} | null {
  if (notification.method !== 'account/login/completed') return null
  const params = notification.params
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null
  const row = params as Record<string, unknown>
  return {
    loginId: typeof row.loginId === 'string' && row.loginId.trim().length > 0 ? row.loginId.trim() : null,
    success: row.success === true,
    error: typeof row.error === 'string' && row.error.trim().length > 0 ? row.error.trim() : null,
  }
}

function deriveAccountStatus(account: UiAccount | null, requiresOpenaiAuth: boolean): UiAccountStatus {
  if (account) return 'logged_in'
  if (requiresOpenaiAuth) return 'reauth_required'
  return 'logged_out'
}

function isLoopbackUrl(value: string): boolean {
  const normalizedValue = value.trim()
  if (!normalizedValue) return false

  try {
    const parsed = new URL(normalizedValue)
    return (
      parsed.hostname === 'localhost'
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname === '[::1]'
    )
  } catch {
    return false
  }
}

const MOBILE_MEDIA_QUERY = '(max-width: 720px)'

const accountStatus = ref<UiAccountStatus>('loading')
const currentAccount = ref<UiAccount | null>(null)
const authMode = ref<UiAccountAuthMode | null>(null)
const requiresOpenaiAuth = ref(false)
const rateLimitSnapshot = ref<AccountRateLimitSnapshot | null>(null)
const forcedLoginMethod = ref<UiForcedLoginMethod | null>(null)
const accountProfiles = ref<UiAccountProfile[]>([])
const activeProfileId = ref('')
const isMobileClient = ref(false)
const accountCenterOpen = ref(false)
const accountCenterView = ref<UiAccountCenterView>('overview')
const loginFlow = ref<UiAccountLoginFlow>('idle')
const activeLoginId = ref('')
const pendingAuthUrl = ref('')
const apiKeyDraft = ref('')
const error = ref('')
const isBootstrapping = ref(false)
const isSubmitting = ref(false)

let stopNotificationStream: (() => void) | null = null
let stopMobileMediaQueryListener: (() => void) | null = null

function applyMobileClientState(matches: boolean): void {
  isMobileClient.value = matches
}

function setupMobileClientDetector(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    applyMobileClientState(false)
    return
  }
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
  applyMobileClientState(mediaQuery.matches)

  const listener = (event: MediaQueryListEvent) => {
    applyMobileClientState(event.matches)
  }
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener)
    stopMobileMediaQueryListener = () => mediaQuery.removeEventListener('change', listener)
    return
  }

  mediaQuery.addListener(listener)
  stopMobileMediaQueryListener = () => mediaQuery.removeListener(listener)
}

function teardownMobileClientDetector(): void {
  stopMobileMediaQueryListener?.()
  stopMobileMediaQueryListener = null
}

function clearPendingLoginState(): void {
  activeLoginId.value = ''
  pendingAuthUrl.value = ''
}

function setLoginFailure(message: string): void {
  loginFlow.value = 'failed'
  accountCenterView.value = 'login_progress'
  error.value = message
}

async function refreshRateLimits(): Promise<void> {
  try {
    rateLimitSnapshot.value = await getAccountRateLimitSnapshot()
  } catch {
    // Keep the last usable snapshot when rate-limit RPC is temporarily unavailable.
  }
}

async function refreshAccountProfiles(): Promise<void> {
  const snapshot = await listAccountProfiles()
  activeProfileId.value = snapshot.activeProfileId
  accountProfiles.value = snapshot.profiles
}

async function refreshAccountSnapshot(options: {
  refreshToken?: boolean
  fallbackAuthMode?: UiAccountAuthMode | null
  preserveLoginFlow?: boolean
} = {}): Promise<void> {
  const snapshot = options.refreshToken === true
    ? await refreshAccountStatus()
    : await getAccountStatus()

  currentAccount.value = snapshot.account
  requiresOpenaiAuth.value = snapshot.requiresOpenaiAuth
  authMode.value = snapshot.authMode ?? options.fallbackAuthMode ?? authMode.value
  accountStatus.value = deriveAccountStatus(snapshot.account, snapshot.requiresOpenaiAuth)

  if (options.preserveLoginFlow === true) {
    return
  }

  if (snapshot.account) {
    accountCenterView.value = 'overview'
    loginFlow.value = 'idle'
    clearPendingLoginState()
    apiKeyDraft.value = ''
    error.value = ''
    return
  }

  if (loginFlow.value === 'waiting_completion') {
    return
  }

  if (accountCenterView.value === 'login_progress' && loginFlow.value === 'failed') {
    return
  }

  accountCenterView.value = 'overview'
  loginFlow.value = 'idle'
}

async function refreshBootstrap(options: {
  refreshToken?: boolean
  preserveLoginFlow?: boolean
  silent?: boolean
} = {}): Promise<void> {
  if (isBootstrapping.value) return
  if (options.silent !== true) {
    accountStatus.value = 'loading'
  }
  isBootstrapping.value = true

  try {
    const accountReader = options.refreshToken === true ? refreshAccountStatus : getAccountStatus
    const [accountSnapshot, configSnapshot] = await Promise.all([
      accountReader(),
      readCodexConfig(),
      refreshAccountProfiles(),
    ])

    currentAccount.value = accountSnapshot.account
    requiresOpenaiAuth.value = accountSnapshot.requiresOpenaiAuth
    authMode.value = accountSnapshot.authMode
    forcedLoginMethod.value = configSnapshot.forcedLoginMethod

    if (accountSnapshot.account) {
      await refreshRateLimits()
    } else {
      rateLimitSnapshot.value = null
    }

    accountStatus.value = deriveAccountStatus(accountSnapshot.account, accountSnapshot.requiresOpenaiAuth)

    if (options.preserveLoginFlow !== true && loginFlow.value !== 'waiting_completion') {
      if (accountSnapshot.account) {
        accountCenterView.value = 'overview'
        loginFlow.value = 'idle'
        clearPendingLoginState()
        apiKeyDraft.value = ''
        error.value = ''
      } else if (loginFlow.value === 'failed') {
        accountCenterView.value = 'login_progress'
      } else {
        accountCenterView.value = 'overview'
      }
    }
  } catch (unknownError) {
    accountStatus.value = 'error'
    if (options.silent !== true) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to load account center'
    }
  } finally {
    isBootstrapping.value = false
  }
}

async function openPendingAuthPageOnHost(): Promise<void> {
  const authUrl = pendingAuthUrl.value.trim()
  if (!authUrl) return
  await openUrlInHostBrowser(authUrl)
}

async function openPendingAuthPage(): Promise<void> {
  const authUrl = pendingAuthUrl.value.trim()
  if (!authUrl) return
  if (isLoopbackUrl(authUrl)) {
    await openPendingAuthPageOnHost()
    return
  }
  if (typeof window === 'undefined') return
  const openedWindow = window.open(authUrl, '_blank', 'noopener,noreferrer')
  if (!openedWindow) {
    window.location.assign(authUrl)
  }
}

function openAccountCenter(): void {
  accountCenterOpen.value = true
  error.value = ''
  void refreshBootstrap({
    refreshToken: loginFlow.value !== 'waiting_completion',
    preserveLoginFlow: loginFlow.value === 'waiting_completion',
  })
}

function closeAccountCenter(): void {
  accountCenterOpen.value = false
}

function showAccountOverview(): void {
  accountCenterView.value = 'overview'
  if (loginFlow.value !== 'waiting_completion') {
    loginFlow.value = 'idle'
  }
  error.value = ''
}

function showLoginMethods(): void {
  if (isMobileClient.value) {
    accountCenterView.value = 'overview'
    loginFlow.value = 'idle'
    error.value = '手机端不支持授权登录，请在电脑端新增并登录账号。'
    return
  }
  accountCenterView.value = 'login_methods'
  loginFlow.value = 'selecting_method'
  error.value = ''
}

function showApiKeyForm(): void {
  if (isMobileClient.value) {
    accountCenterView.value = 'overview'
    loginFlow.value = 'idle'
    error.value = '手机端不支持授权登录，请在电脑端新增并登录账号。'
    return
  }
  accountCenterView.value = 'login_methods'
  loginFlow.value = 'api_key_form'
  error.value = ''
}

async function startHostBrowserChatgptLogin(): Promise<void> {
  const result = await startAccountLogin({ type: 'chatgpt' })
  activeLoginId.value = result.loginId ?? ''
  pendingAuthUrl.value = result.authUrl ?? ''
  loginFlow.value = 'waiting_completion'
  await openPendingAuthPage()
}

async function createAndSwitchAccountProfile(name: string | null = null): Promise<UiAccountProfile> {
  const created = await createAccountProfile(name)
  await switchAccountProfile(created.id)
  await refreshBootstrap({ refreshToken: false, preserveLoginFlow: true, silent: true })
  return created
}

async function beginChatgptLogin(options: { createNewProfile?: boolean } = {}): Promise<void> {
  if (isMobileClient.value) {
    showAccountOverview()
    error.value = '手机端不支持授权登录，请在电脑端新增并登录账号。'
    return
  }

  error.value = ''
  isSubmitting.value = true
  loginFlow.value = 'opening_oauth'
  accountCenterView.value = 'login_progress'

  try {
    if (options.createNewProfile === true) {
      await createAndSwitchAccountProfile(null)
    }
    await startHostBrowserChatgptLogin()
  } catch (unknownError) {
    loginFlow.value = 'failed'
    error.value = unknownError instanceof Error ? unknownError.message : 'Failed to start ChatGPT login'
  } finally {
    isSubmitting.value = false
  }
}

async function submitApiKeyLogin(apiKey: string = apiKeyDraft.value): Promise<void> {
  if (isMobileClient.value) {
    showAccountOverview()
    error.value = '手机端不支持授权登录，请在电脑端新增并登录账号。'
    return
  }

  const normalizedApiKey = apiKey.trim()
  if (!normalizedApiKey) {
    error.value = 'API Key is required'
    loginFlow.value = 'api_key_form'
    accountCenterView.value = 'login_methods'
    return
  }

  error.value = ''
  isSubmitting.value = true
  loginFlow.value = 'api_key_form'
  accountCenterView.value = 'login_methods'

  try {
    await startAccountLogin({
      type: 'apiKey',
      apiKey: normalizedApiKey,
    })
    apiKeyDraft.value = ''
    await refreshBootstrap({ refreshToken: true })
  } catch (unknownError) {
    error.value = unknownError instanceof Error ? unknownError.message : 'Failed to login with API Key'
    loginFlow.value = 'api_key_form'
  } finally {
    isSubmitting.value = false
  }
}

async function switchToAccountProfile(profileId: string): Promise<void> {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId || normalizedProfileId === activeProfileId.value) {
    return
  }

  isSubmitting.value = true
  error.value = ''
  try {
    await switchAccountProfile(normalizedProfileId)
    clearPendingLoginState()
    await refreshBootstrap({ refreshToken: true })
    accountCenterView.value = 'overview'
    loginFlow.value = 'idle'
  } catch (unknownError) {
    error.value = unknownError instanceof Error ? unknownError.message : 'Failed to switch account profile'
  } finally {
    isSubmitting.value = false
  }
}

async function cancelPendingLogin(): Promise<void> {
  const loginId = activeLoginId.value.trim()
  if (loginId) {
    isSubmitting.value = true
    try {
      await cancelAccountLogin(loginId)
    } finally {
      isSubmitting.value = false
    }
  }

  clearPendingLoginState()
  error.value = ''
  showLoginMethods()
  await refreshAccountSnapshot({ preserveLoginFlow: false })
}

async function performLogout(): Promise<void> {
  isSubmitting.value = true
  error.value = ''
  try {
    await logoutAccount()
    clearPendingLoginState()
    await refreshBootstrap({ refreshToken: false })
  } catch (unknownError) {
    error.value = unknownError instanceof Error ? unknownError.message : 'Failed to logout'
  } finally {
    isSubmitting.value = false
  }
}

function handleNotification(notification: RpcNotification): void {
  if (notification.method === 'account/updated') {
    const params = notification.params
    const nextAuthMode =
      params && typeof params === 'object' && !Array.isArray(params)
        ? normalizeAccountAuthMode((params as Record<string, unknown>).authMode)
        : null
    if (nextAuthMode) {
      authMode.value = nextAuthMode
    }
    void refreshAccountSnapshot({
      fallbackAuthMode: nextAuthMode,
      preserveLoginFlow: loginFlow.value === 'waiting_completion',
    })
    return
  }

  const completed = readLoginCompleted(notification)
  if (completed) {
    if (activeLoginId.value && completed.loginId && completed.loginId !== activeLoginId.value) {
      return
    }
    if (completed.success) {
      void refreshBootstrap({ refreshToken: true })
    } else {
      setLoginFailure(completed.error ?? 'Login did not complete')
    }
    return
  }

  if (notification.method === 'account/rateLimits/updated') {
    void refreshRateLimits()
  }
}

function startAccountCenterState(): void {
  if (stopNotificationStream) return
  setupMobileClientDetector()
  stopNotificationStream = subscribeCodexNotifications((notification) => {
    handleNotification(notification)
  })
  void refreshBootstrap({ preserveLoginFlow: loginFlow.value === 'waiting_completion', silent: true })
}

function stopAccountCenterState(): void {
  teardownMobileClientDetector()
  if (!stopNotificationStream) return
  stopNotificationStream()
  stopNotificationStream = null
}

const availableLoginMethods = computed<Array<'chatgpt' | 'apiKey'>>(() => {
  if (isMobileClient.value) return []
  if (forcedLoginMethod.value === 'chatgpt') return ['chatgpt']
  if (forcedLoginMethod.value === 'apiKey') return ['apiKey']
  return ['chatgpt', 'apiKey']
})

const opensAuthOnHostBrowser = computed<boolean>(() => isLoopbackUrl(pendingAuthUrl.value))

export function useAccountCenterState() {
  return {
    accountStatus,
    currentAccount,
    authMode,
    requiresOpenaiAuth,
    rateLimitSnapshot,
    forcedLoginMethod,
    accountProfiles,
    activeProfileId,
    isMobileClient,
    availableLoginMethods,
    opensAuthOnHostBrowser,
    accountCenterOpen,
    accountCenterView,
    loginFlow,
    activeLoginId,
    pendingAuthUrl,
    apiKeyDraft,
    error,
    isBootstrapping,
    isSubmitting,
    openAccountCenter,
    closeAccountCenter,
    showAccountOverview,
    showLoginMethods,
    showApiKeyForm,
    beginChatgptLogin,
    createAndSwitchAccountProfile,
    switchToAccountProfile,
    submitApiKeyLogin,
    cancelPendingLogin,
    openPendingAuthPageOnHost,
    openPendingAuthPage,
    performLogout,
    refreshAccountCenter: refreshBootstrap,
    startAccountCenterState,
    stopAccountCenterState,
  }
}
