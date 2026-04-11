import { computed, ref } from 'vue'
import {
  cancelAccountLogin,
  getMobileChatgptLoginStatus,
  getAccountRateLimitSnapshot,
  getAccountStatus,
  logoutAccount,
  openUrlInHostBrowser,
  readCodexConfig,
  refreshAccountStatus,
  startMobileChatgptLogin,
  startAccountLogin,
  subscribeCodexNotifications,
  type AccountRateLimitSnapshot,
  type RpcNotification,
} from '../api/codexGateway'
import type {
  UiAccount,
  UiAccountAuthMode,
  UiAccountCenterView,
  UiAccountLoginFlow,
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

const accountStatus = ref<UiAccountStatus>('loading')
const currentAccount = ref<UiAccount | null>(null)
const authMode = ref<UiAccountAuthMode | null>(null)
const requiresOpenaiAuth = ref(false)
const rateLimitSnapshot = ref<AccountRateLimitSnapshot | null>(null)
const forcedLoginMethod = ref<UiForcedLoginMethod | null>(null)
const mobileDirectAuthAvailable = ref(false)
const publicBaseUrl = ref('')
const accountCenterOpen = ref(false)
const accountCenterView = ref<UiAccountCenterView>('overview')
const loginFlow = ref<UiAccountLoginFlow>('idle')
const activeLoginId = ref('')
const activeMobileLoginSessionId = ref('')
const pendingAuthUrl = ref('')
const apiKeyDraft = ref('')
const error = ref('')
const isBootstrapping = ref(false)
const isSubmitting = ref(false)

let stopNotificationStream: (() => void) | null = null
let mobileLoginPollTimer: ReturnType<typeof setTimeout> | null = null

function stopMobileLoginPolling(): void {
  if (!mobileLoginPollTimer) return
  clearTimeout(mobileLoginPollTimer)
  mobileLoginPollTimer = null
}

function clearPendingLoginState(): void {
  stopMobileLoginPolling()
  activeLoginId.value = ''
  activeMobileLoginSessionId.value = ''
  pendingAuthUrl.value = ''
}

function setLoginFailure(message: string): void {
  stopMobileLoginPolling()
  loginFlow.value = 'failed'
  accountCenterView.value = 'login_progress'
  error.value = message
}

function mapMobileDirectAuthError(status: 'failed' | 'expired' | 'public_url_changed' | 'server_restarted', fallback: string | null): string {
  if (fallback && fallback.trim().length > 0) return fallback.trim()
  if (status === 'expired') return 'ChatGPT login expired. Please try again.'
  if (status === 'public_url_changed') return 'Public access URL changed. Please restart ChatGPT login.'
  if (status === 'server_restarted') return 'The local auth relay restarted. Please start ChatGPT login again.'
  return 'ChatGPT login did not complete'
}

async function pollMobileLoginStatus(): Promise<void> {
  const loginSessionId = activeMobileLoginSessionId.value.trim()
  if (!loginSessionId) return

  try {
    const status = await getMobileChatgptLoginStatus(loginSessionId)
    if (activeMobileLoginSessionId.value !== loginSessionId) {
      return
    }

    if (status.status === 'pending') {
      mobileLoginPollTimer = setTimeout(() => {
        void pollMobileLoginStatus()
      }, 1500)
      return
    }

    if (status.status === 'success') {
      stopMobileLoginPolling()
      await refreshBootstrap({ refreshToken: true })
      return
    }

    setLoginFailure(mapMobileDirectAuthError(status.status, status.error))
  } catch (unknownError) {
    setLoginFailure(unknownError instanceof Error ? unknownError.message : 'Failed to monitor ChatGPT login')
  }
}

async function refreshRateLimits(): Promise<void> {
  try {
    rateLimitSnapshot.value = await getAccountRateLimitSnapshot()
  } catch {
    // Keep the last usable snapshot when rate-limit RPC is temporarily unavailable.
  }
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
    const [accountSnapshot, configSnapshot, limits] = await Promise.all([
      accountReader(),
      readCodexConfig(),
      getAccountRateLimitSnapshot(),
    ])

    currentAccount.value = accountSnapshot.account
    requiresOpenaiAuth.value = accountSnapshot.requiresOpenaiAuth
    authMode.value = accountSnapshot.authMode
    forcedLoginMethod.value = configSnapshot.forcedLoginMethod
    mobileDirectAuthAvailable.value = configSnapshot.mobileDirectAuthAvailable
    publicBaseUrl.value = configSnapshot.publicBaseUrl ?? ''
    rateLimitSnapshot.value = limits
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
  accountCenterView.value = 'login_methods'
  loginFlow.value = 'selecting_method'
  error.value = ''
}

function showApiKeyForm(): void {
  accountCenterView.value = 'login_methods'
  loginFlow.value = 'api_key_form'
  error.value = ''
}

async function beginChatgptLogin(): Promise<void> {
  error.value = ''
  isSubmitting.value = true
  loginFlow.value = 'opening_oauth'
  accountCenterView.value = 'login_progress'

  try {
    if (mobileDirectAuthAvailable.value) {
      const result = await startMobileChatgptLogin()
      activeLoginId.value = ''
      activeMobileLoginSessionId.value = result.loginSessionId
      pendingAuthUrl.value = result.authUrl
      loginFlow.value = 'waiting_completion'
      await openPendingAuthPage()
      stopMobileLoginPolling()
      mobileLoginPollTimer = setTimeout(() => {
        void pollMobileLoginStatus()
      }, 1500)
      return
    }

    const result = await startAccountLogin({ type: 'chatgpt' })
    activeLoginId.value = result.loginId ?? ''
    activeMobileLoginSessionId.value = ''
    pendingAuthUrl.value = result.authUrl ?? ''
    loginFlow.value = 'waiting_completion'
    await openPendingAuthPage()
  } catch (unknownError) {
    loginFlow.value = 'failed'
    error.value = unknownError instanceof Error ? unknownError.message : 'Failed to start ChatGPT login'
  } finally {
    isSubmitting.value = false
  }
}

async function submitApiKeyLogin(apiKey: string = apiKeyDraft.value): Promise<void> {
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
      stopMobileLoginPolling()
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
  stopNotificationStream = subscribeCodexNotifications((notification) => {
    handleNotification(notification)
  })
  void refreshBootstrap({ preserveLoginFlow: loginFlow.value === 'waiting_completion', silent: true })
}

function stopAccountCenterState(): void {
  stopMobileLoginPolling()
  if (!stopNotificationStream) return
  stopNotificationStream()
  stopNotificationStream = null
}

const availableLoginMethods = computed<Array<'chatgpt' | 'apiKey'>>(() => {
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
    mobileDirectAuthAvailable,
    publicBaseUrl,
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
