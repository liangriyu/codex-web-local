import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export type AccountProvider = 'chatgptAuthTokens'
export type AccountProfileStatus = 'active' | 'inactive' | 'expired' | 'revoked'

export type AccountTokenPayload = {
  accessToken: string
  chatgptAccountId: string
  chatgptPlanType: string | null
  expiresAtIso: string | null
}

export type AccountManagedTokenPayload = {
  idToken: string | null
  accessToken: string
  refreshToken: string | null
  accountId: string
}

export type AccountProfile = {
  profileId: string
  accountId: string
  provider: AccountProvider
  email: string | null
  planType: string | null
  tokenPayload: AccountTokenPayload | null
  managedTokenPayload: AccountManagedTokenPayload | null
  status: AccountProfileStatus
  lastUsedAtIso: string | null
}

export type AccountProfileSnapshot = {
  activeProfileId: string | null
  profiles: AccountProfile[]
  updatedAtIso: string
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT'
}

function getAccountProfileStoreDirectory(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  const baseDir = codexHome && codexHome.length > 0
    ? resolve(codexHome)
    : resolve(homedir(), '.codex')
  return join(baseDir, 'codex-web-local')
}

export function resolveAccountProfileStorePath(): string {
  return join(getAccountProfileStoreDirectory(), 'account-profiles.json')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeTokenPayload(value: unknown): AccountTokenPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const accessToken = normalizeText(row.accessToken)
  const chatgptAccountId = normalizeText(row.chatgptAccountId)
  if (!accessToken || !chatgptAccountId) return null
  return {
    accessToken,
    chatgptAccountId,
    chatgptPlanType: normalizeNullableText(row.chatgptPlanType),
    expiresAtIso: normalizeNullableText(row.expiresAtIso),
  }
}

function normalizeManagedTokenPayload(value: unknown): AccountManagedTokenPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const accessToken = normalizeText(row.accessToken)
  const accountId = normalizeText(row.accountId)
  if (!accessToken || !accountId) return null
  return {
    idToken: normalizeNullableText(row.idToken),
    accessToken,
    refreshToken: normalizeNullableText(row.refreshToken),
    accountId,
  }
}

function normalizeProfile(value: unknown): AccountProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const profileId = normalizeText(row.profileId)
  const accountId = normalizeText(row.accountId)
  if (!profileId || !accountId) return null
  return {
    profileId,
    accountId,
    provider: 'chatgptAuthTokens',
    email: normalizeNullableText(row.email),
    planType: normalizeNullableText(row.planType),
    tokenPayload: normalizeTokenPayload(row.tokenPayload),
    managedTokenPayload: normalizeManagedTokenPayload(row.managedTokenPayload),
    status: row.status === 'active' || row.status === 'expired' || row.status === 'revoked'
      ? row.status
      : 'inactive',
    lastUsedAtIso: normalizeNullableText(row.lastUsedAtIso),
  }
}

function normalizeSnapshot(value: unknown): AccountProfileSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      activeProfileId: null,
      profiles: [],
      updatedAtIso: new Date().toISOString(),
    }
  }
  const row = value as Record<string, unknown>
  const rawProfiles = Array.isArray(row.profiles) ? row.profiles : []
  const profiles = rawProfiles
    .map((entry) => normalizeProfile(entry))
    .filter((entry): entry is AccountProfile => entry !== null)
    .sort((first, second) => first.profileId.localeCompare(second.profileId))
  const activeProfileIdRaw = normalizeNullableText(row.activeProfileId)
  const activeProfileId = activeProfileIdRaw && profiles.some((profile) => profile.profileId === activeProfileIdRaw)
    ? activeProfileIdRaw
    : null
  return {
    activeProfileId,
    profiles,
    updatedAtIso: normalizeNullableText(row.updatedAtIso) ?? new Date().toISOString(),
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const normalizedToken = token.trim()
  if (!normalizedToken) return null
  const segments = normalizedToken.split('.')
  if (segments.length < 2) return null

  const payloadSegment = segments[1]
  const normalizedPayload = payloadSegment.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (normalizedPayload.length % 4)) % 4
  const paddedPayload = normalizedPayload + '='.repeat(paddingLength)

  try {
    const decoded = Buffer.from(paddedPayload, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    return asRecord(parsed)
  } catch {
    return null
  }
}

async function readLegacyProfileAuth(codexHomeDir: string): Promise<{
  tokenPayload: AccountTokenPayload | null
  managedTokenPayload: AccountManagedTokenPayload | null
  email: string | null
  planType: string | null
  chatgptAccountId: string | null
}> {
  const normalizedCodexHomeDir = normalizeText(codexHomeDir)
  if (!normalizedCodexHomeDir) {
    return {
      tokenPayload: null,
      managedTokenPayload: null,
      email: null,
      planType: null,
      chatgptAccountId: null,
    }
  }

  try {
    const authPath = join(resolve(normalizedCodexHomeDir), 'auth.json')
    const raw = await readFile(authPath, 'utf8')
    const body = asRecord(JSON.parse(raw))
    const authMode = normalizeText(body?.auth_mode)
    const tokens = asRecord(body?.tokens)
    const accessToken = normalizeText(tokens?.access_token)
    const accountId = normalizeText(tokens?.account_id)
    const idToken = normalizeNullableText(tokens?.id_token)
    const refreshToken = normalizeNullableText(tokens?.refresh_token)
    const accessTokenPayload = decodeJwtPayload(accessToken)
    const authClaims = asRecord(accessTokenPayload?.['https://api.openai.com/auth'])
    const profileClaims = asRecord(accessTokenPayload?.['https://api.openai.com/profile'])
    const chatgptAccountId = normalizeText(authClaims?.chatgpt_account_id) || accountId
    const planType = normalizeNullableText(authClaims?.chatgpt_plan_type)
    const email = normalizeNullableText(profileClaims?.email)
    const hasManagedHints = authMode === 'chatgpt' || idToken !== null || refreshToken !== null
    const managedTokenPayload = hasManagedHints && accessToken && accountId
      ? {
          idToken,
          accessToken,
          refreshToken,
          accountId,
        }
      : null

    if (!accessToken || !chatgptAccountId) {
      return {
        tokenPayload: null,
        managedTokenPayload,
        email,
        planType,
        chatgptAccountId: chatgptAccountId || null,
      }
    }

    return {
      tokenPayload: {
        accessToken,
        chatgptAccountId,
        chatgptPlanType: planType,
        expiresAtIso: null,
      },
      managedTokenPayload,
      email,
      planType,
      chatgptAccountId,
    }
  } catch {
    return {
      tokenPayload: null,
      managedTokenPayload: null,
      email: null,
      planType: null,
      chatgptAccountId: null,
    }
  }
}

async function normalizeLegacyProfile(
  value: unknown,
  activeProfileId: string | null,
): Promise<AccountProfile | null> {
  const row = asRecord(value)
  if (!row) return null

  const profileId = normalizeText(row.id)
  if (!profileId) return null

  const legacyName = normalizeText(row.name)
  const legacyLastUsedAtIso = normalizeNullableText(row.lastUsedAt)
    ?? normalizeNullableText(row.updatedAt)
    ?? normalizeNullableText(row.createdAt)
  const auth = await readLegacyProfileAuth(normalizeText(row.codexHomeDir))
  const fallbackAccountId = legacyName || profileId
  const accountId = auth.email ?? auth.chatgptAccountId ?? fallbackAccountId

  return {
    profileId,
    accountId,
    provider: 'chatgptAuthTokens',
    email: auth.email,
    planType: auth.planType,
    tokenPayload: auth.tokenPayload,
    managedTokenPayload: auth.managedTokenPayload,
    status: profileId === activeProfileId ? 'active' : 'inactive',
    lastUsedAtIso: legacyLastUsedAtIso,
  }
}

async function tryMigrateLegacySnapshot(value: unknown): Promise<AccountProfileSnapshot | null> {
  const row = asRecord(value)
  if (!row) return null
  const rawProfiles = Array.isArray(row.profiles) ? row.profiles : []
  if (rawProfiles.length === 0) return null

  const activeProfileIdRaw = normalizeNullableText(row.activeProfileId)
  const nextProfiles: AccountProfile[] = []
  let migratedLegacyEntryCount = 0

  for (const entry of rawProfiles) {
    const normalized = normalizeProfile(entry)
    if (normalized) {
      nextProfiles.push(normalized)
      continue
    }

    const legacy = await normalizeLegacyProfile(entry, activeProfileIdRaw)
    if (legacy) {
      nextProfiles.push(legacy)
      migratedLegacyEntryCount += 1
    }
  }

  if (migratedLegacyEntryCount === 0) return null

  const dedupedProfiles = new Map<string, AccountProfile>()
  for (const profile of nextProfiles) {
    dedupedProfiles.set(profile.profileId, profile)
  }
  const profiles = Array.from(dedupedProfiles.values())
    .sort((first, second) => first.profileId.localeCompare(second.profileId))

  const activeProfileId = activeProfileIdRaw && profiles.some((profile) => profile.profileId === activeProfileIdRaw)
    ? activeProfileIdRaw
    : null
  return {
    activeProfileId,
    profiles,
    updatedAtIso: normalizeNullableText(row.updatedAtIso) ?? new Date().toISOString(),
  }
}

async function loadSnapshot(): Promise<AccountProfileSnapshot> {
  const path = resolveAccountProfileStorePath()
  try {
    const raw = await readFile(path, 'utf8')
    const payload = JSON.parse(raw)
    const migratedLegacySnapshot = await tryMigrateLegacySnapshot(payload)
    if (migratedLegacySnapshot) {
      await persistSnapshot(migratedLegacySnapshot)
      return migratedLegacySnapshot
    }
    return normalizeSnapshot(payload)
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        activeProfileId: null,
        profiles: [],
        updatedAtIso: new Date().toISOString(),
      }
    }
    throw error
  }
}

async function persistSnapshot(snapshot: AccountProfileSnapshot): Promise<void> {
  const path = resolveAccountProfileStorePath()
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })

  const tempPath = join(directory, `.account-profiles.${process.pid}.${Date.now()}.${randomUUID()}.tmp`)
  const payload: AccountProfileSnapshot = {
    ...snapshot,
    updatedAtIso: new Date().toISOString(),
    profiles: [...snapshot.profiles].sort((first, second) => first.profileId.localeCompare(second.profileId)),
  }

  try {
    await writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf8')
    await rename(tempPath, path)
  } catch (error) {
    try {
      await rm(tempPath, { force: true })
    } catch {
      // Ignore cleanup failure and rethrow original error.
    }
    throw error
  }
}

export async function readAccountProfileSnapshot(): Promise<AccountProfileSnapshot> {
  return loadSnapshot()
}

export async function listAccountProfiles(): Promise<AccountProfile[]> {
  const snapshot = await loadSnapshot()
  return snapshot.profiles
}

export async function upsertAccountProfile(profile: AccountProfile): Promise<void> {
  const normalized = normalizeProfile(profile)
  if (!normalized) {
    throw new Error('Invalid account profile payload')
  }
  const snapshot = await loadSnapshot()
  const index = snapshot.profiles.findIndex((item) => item.profileId === normalized.profileId)
  if (index >= 0) {
    snapshot.profiles[index] = normalized
  } else {
    snapshot.profiles.push(normalized)
  }
  await persistSnapshot(snapshot)
}

export async function setActiveAccountProfile(profileId: string | null): Promise<void> {
  const snapshot = await loadSnapshot()
  const normalizedProfileId = normalizeNullableText(profileId)
  if (!normalizedProfileId) {
    snapshot.activeProfileId = null
    await persistSnapshot(snapshot)
    return
  }
  if (!snapshot.profiles.some((profile) => profile.profileId === normalizedProfileId)) {
    throw new Error(`Account profile not found: ${normalizedProfileId}`)
  }
  snapshot.activeProfileId = normalizedProfileId
  await persistSnapshot(snapshot)
}

export async function removeAccountProfile(profileId: string): Promise<void> {
  const normalizedProfileId = normalizeText(profileId)
  if (!normalizedProfileId) return

  const snapshot = await loadSnapshot()
  snapshot.profiles = snapshot.profiles.filter((profile) => profile.profileId !== normalizedProfileId)
  if (snapshot.activeProfileId === normalizedProfileId) {
    snapshot.activeProfileId = null
  }
  await persistSnapshot(snapshot)
}
