import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export type AccountProfile = {
  id: string
  name: string
  codexHomeDir: string
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
  email?: string | null
  hasAuth?: boolean
  authMode?: 'chatgpt' | 'apiKey' | null
}

type PersistedAccountProfiles = {
  version: 1
  activeProfileId: string | null
  profiles: AccountProfile[]
}

type AccountProfileStoreServerMode = 'shared' | 'isolated'

const DEFAULT_PROFILE_ID = 'default'
const DEFAULT_PROFILE_NAME = '默认账号'

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const normalizedToken = readText(token)
  if (!normalizedToken) return null
  const [, payloadSegment = ''] = normalizedToken.split('.')
  if (!payloadSegment) return null
  try {
    const parsed = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as unknown
    return asRecord(parsed)
  } catch {
    return null
  }
}

function readEmailFromJwtPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return ''
  const directEmail = readText(payload.email)
  if (directEmail) return directEmail
  const profile = asRecord(payload['https://api.openai.com/profile'])
  return readText(profile?.email)
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT'
  )
}

type ProfileAuthSummary = {
  hasAuth: boolean
  email: string | null
  authMode: 'chatgpt' | 'apiKey' | null
  authFingerprint: string | null
}

function getBaseCodexHomeDir(): string {
  const configured = readText(process.env.CODEX_HOME)
  if (configured) {
    return isAbsolute(configured) ? configured : resolve(configured)
  }
  return join(homedir(), '.codex')
}

function getProfilesLedgerPath(): string {
  return join(getBaseCodexHomeDir(), 'codex-web-local', 'account-profiles.json')
}

function toAbsolutePath(value: string): string {
  const normalized = readText(value)
  if (!normalized) return ''
  return isAbsolute(normalized) ? resolve(normalized) : resolve(process.cwd(), normalized)
}

function normalizeProfile(value: unknown): AccountProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const id = readText(row.id)
  const name = readText(row.name)
  const codexHomeDir = toAbsolutePath(readText(row.codexHomeDir))
  const createdAt = readText(row.createdAt)
  const updatedAt = readText(row.updatedAt)
  const lastUsedAtRaw = readText(row.lastUsedAt)

  if (!id || !name || !codexHomeDir || !createdAt || !updatedAt) return null
  return {
    id,
    name,
    codexHomeDir,
    createdAt,
    updatedAt,
    lastUsedAt: lastUsedAtRaw || null,
  }
}

function createDefaultProfile(nowIso: string): AccountProfile {
  return {
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    codexHomeDir: getBaseCodexHomeDir(),
    createdAt: nowIso,
    updatedAt: nowIso,
    lastUsedAt: nowIso,
  }
}

export class AccountProfileStore {
  private readonly serverMode: AccountProfileStoreServerMode
  private readonly ledgerPath = getProfilesLedgerPath()
  private loaded = false
  private activeProfileId: string | null = null
  private readonly profiles = new Map<string, AccountProfile>()
  private flushChain: Promise<void> = Promise.resolve()

  constructor(options: { serverMode?: AccountProfileStoreServerMode } = {}) {
    this.serverMode = options.serverMode ?? 'isolated'
  }

  private async ensureProfileDirectory(codexHomeDir: string): Promise<void> {
    await mkdir(codexHomeDir, { recursive: true })
  }

  private async syncConversationArtifacts(sourceCodexHomeDir: string | null, targetCodexHomeDir: string): Promise<void> {
    if (this.serverMode === 'shared') return
    const source = readText(sourceCodexHomeDir)
    const target = readText(targetCodexHomeDir)
    if (!source || !target) return
    if (resolve(source) === resolve(target)) return

    const readFileSize = async (filePath: string): Promise<number> => {
      try {
        const fileStat = await stat(filePath)
        return fileStat.isFile() ? fileStat.size : 0
      } catch (error) {
        if (isNotFoundError(error)) return 0
        throw error
      }
    }

    const syncSqliteBundle = async (baseName: string): Promise<void> => {
      const suffixes = ['', '-wal', '-shm']
      const sourceMainPath = join(source, baseName)
      const targetMainPath = join(target, baseName)

      let sourceMainStat: Awaited<ReturnType<typeof stat>>
      try {
        sourceMainStat = await stat(sourceMainPath)
      } catch (error) {
        if (isNotFoundError(error)) return
        throw error
      }
      if (!sourceMainStat.isFile()) return

      let targetMainStat: Awaited<ReturnType<typeof stat>> | null = null
      try {
        const candidate = await stat(targetMainPath)
        targetMainStat = candidate.isFile() ? candidate : null
      } catch (error) {
        if (!isNotFoundError(error)) throw error
      }

      const sourceBundleSize = (
        await Promise.all(suffixes.map((suffix) => readFileSize(join(source, `${baseName}${suffix}`))))
      ).reduce((sum, size) => sum + size, 0)

      const targetBundleSize = (
        await Promise.all(suffixes.map((suffix) => readFileSize(join(target, `${baseName}${suffix}`))))
      ).reduce((sum, size) => sum + size, 0)

      if (targetMainStat && sourceBundleSize <= targetBundleSize) {
        return
      }

      for (const suffix of suffixes) {
        const sourcePath = join(source, `${baseName}${suffix}`)
        const targetPath = join(target, `${baseName}${suffix}`)

        try {
          const sourceFileStat = await stat(sourcePath)
          if (!sourceFileStat.isFile()) continue
          await cp(sourcePath, targetPath, { force: true })
        } catch (error) {
          if (isNotFoundError(error)) {
            if (suffix !== '') {
              await rm(targetPath, { force: true })
            }
            continue
          }
          throw error
        }
      }
    }

    const syncFile = async (relativePath: string): Promise<void> => {
      const sourcePath = join(source, relativePath)
      const targetPath = join(target, relativePath)
      const sourceStat = await stat(sourcePath)
      if (!sourceStat.isFile()) return
      await cp(sourcePath, targetPath, { force: true })
    }

    const syncDirectory = async (relativePath: string): Promise<void> => {
      const sourcePath = join(source, relativePath)
      const targetPath = join(target, relativePath)
      const sourceStat = await stat(sourcePath)
      if (!sourceStat.isDirectory()) return
      await cp(sourcePath, targetPath, {
        recursive: true,
        force: true,
      })
    }

    const tasks: Array<{ label: string; run: () => Promise<void> }> = [
      { label: 'state_5.sqlite bundle', run: () => syncSqliteBundle('state_5.sqlite') },
      { label: 'logs_1.sqlite bundle', run: () => syncSqliteBundle('logs_1.sqlite') },
      { label: 'logs_2.sqlite bundle', run: () => syncSqliteBundle('logs_2.sqlite') },
      { label: 'session_index.jsonl', run: () => syncFile('session_index.jsonl') },
      { label: 'sessions', run: () => syncDirectory('sessions') },
      { label: 'archived_sessions', run: () => syncDirectory('archived_sessions') },
    ]

    for (const task of tasks) {
      try {
        await task.run()
      } catch (error) {
        if (isNotFoundError(error)) continue
        console.warn(`[codex-web-local] Failed to sync profile artifact "${task.label}":`, error)
      }
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return

    try {
      const raw = await readFile(this.ledgerPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedAccountProfiles> | null
      const profileRows = Array.isArray(parsed?.profiles) ? parsed.profiles : []
      this.profiles.clear()

      for (const row of profileRows) {
        const profile = normalizeProfile(row)
        if (!profile) continue
        this.profiles.set(profile.id, profile)
      }

      const activeId = readText(parsed?.activeProfileId)
      this.activeProfileId = activeId && this.profiles.has(activeId) ? activeId : null
    } catch {
      // Missing or malformed file: fall back to default profile initialization.
      this.profiles.clear()
      this.activeProfileId = null
    }

    if (this.profiles.size === 0) {
      const nowIso = new Date().toISOString()
      const defaultProfile = createDefaultProfile(nowIso)
      this.profiles.set(defaultProfile.id, defaultProfile)
      this.activeProfileId = defaultProfile.id
      await this.ensureProfileDirectory(defaultProfile.codexHomeDir)
      await this.flush()
    } else if (!this.activeProfileId) {
      const firstProfile = Array.from(this.profiles.values())
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt))[0]
      this.activeProfileId = firstProfile?.id ?? null
      await this.flush()
    }

    const activeProfile = this.activeProfileId ? this.profiles.get(this.activeProfileId) : null
    if (activeProfile) {
      await this.ensureProfileDirectory(activeProfile.codexHomeDir)
    }

    this.loaded = true
  }

  private getSortedProfiles(): AccountProfile[] {
    return Array.from(this.profiles.values())
      .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
  }

  private queueFlush(): void {
    this.flushChain = this.flushChain
      .catch(() => {})
      .then(async () => {
        await this.flush()
      })
      .catch((error) => {
        console.warn('[codex-web-local] Failed to persist account profiles:', error)
      })
  }

  private async flush(): Promise<void> {
    const payload: PersistedAccountProfiles = {
      version: 1,
      activeProfileId: this.activeProfileId,
      profiles: this.getSortedProfiles(),
    }
    await mkdir(dirname(this.ledgerPath), { recursive: true })
    await writeFile(this.ledgerPath, JSON.stringify(payload, null, 2), 'utf8')
  }

  async list(): Promise<{ activeProfileId: string; profiles: AccountProfile[] }> {
    await this.ensureLoaded()
    const activeProfileId = this.activeProfileId
    if (!activeProfileId) {
      throw new Error('No active account profile')
    }
    return {
      activeProfileId,
      profiles: this.getSortedProfiles(),
    }
  }

  async listVisible(): Promise<{ activeProfileId: string; profiles: AccountProfile[] }> {
    const snapshot = await this.list()

    const readProfileAuthSummary = async (profile: AccountProfile): Promise<ProfileAuthSummary> => {
      const authPath = join(profile.codexHomeDir, 'auth.json')
      try {
        const raw = await readFile(authPath, 'utf8')
        const parsed = asRecord(JSON.parse(raw))
        if (!parsed) {
          return { hasAuth: false, email: null, authMode: null, authFingerprint: null }
        }

        const authModeRaw = readText(parsed.auth_mode).toLowerCase()
        const authMode = authModeRaw.includes('chatgpt')
          ? 'chatgpt'
          : (authModeRaw.includes('api') ? 'apiKey' : null)

        const tokens = asRecord(parsed.tokens)
        const idTokenPayload = parseJwtPayload(readText(tokens?.id_token))
        const accessTokenPayload = parseJwtPayload(readText(tokens?.access_token))
        const email = readEmailFromJwtPayload(idTokenPayload)
          || readEmailFromJwtPayload(accessTokenPayload)
          || null

        const hasApiKey = readText(parsed.OPENAI_API_KEY).length > 0
        const hasTokenMaterial = (
          readText(tokens?.id_token).length > 0
          || readText(tokens?.access_token).length > 0
          || readText(tokens?.refresh_token).length > 0
        )

        return {
          hasAuth: hasApiKey || hasTokenMaterial || authMode !== null,
          email,
          authMode,
          authFingerprint: raw.trim() || null,
        }
      } catch {
        return { hasAuth: false, email: null, authMode: null, authFingerprint: null }
      }
    }

    const visibleRows = await Promise.all(snapshot.profiles.map(async (profile) => {
      const authSummary = await readProfileAuthSummary(profile)
      const accountSuffix = authSummary.email
        ? authSummary.email
        : (authSummary.authMode === 'apiKey' ? 'API Key' : '')
      const decoratedName = (accountSuffix && !profile.name.includes(accountSuffix))
        ? `${profile.name} · ${accountSuffix}`
        : profile.name
      const decoratedProfile: AccountProfile = {
        ...profile,
        name: decoratedName,
        email: authSummary.email,
        hasAuth: authSummary.hasAuth,
        authMode: authSummary.authMode,
      }

      if (profile.id === snapshot.activeProfileId) {
        return { profile: decoratedProfile, visible: true, authSummary }
      }
      if (this.serverMode === 'shared') {
        return { profile: decoratedProfile, visible: true, authSummary }
      }
      return {
        profile: decoratedProfile,
        visible: authSummary.hasAuth,
        authSummary,
      }
    }))

    return {
      activeProfileId: snapshot.activeProfileId,
      profiles: visibleRows
        .filter((row) => row.visible)
        .filter((row) => {
          if (this.serverMode !== 'shared') return true
          if (row.profile.id === DEFAULT_PROFILE_ID) return true

          const defaultRow = visibleRows.find((candidate) => candidate.profile.id === DEFAULT_PROFILE_ID) ?? null
          const defaultFingerprint = defaultRow?.authSummary.authFingerprint ?? null
          if (!defaultFingerprint) return true

          return row.authSummary.authFingerprint !== defaultFingerprint
        })
        .map((row) => row.profile),
    }
  }

  async create(name: string | null = null): Promise<AccountProfile> {
    await this.ensureLoaded()

    const nowIso = new Date().toISOString()
    const id = randomUUID()
    const normalizedName = readText(name)
    const profileName = normalizedName || `账号 ${String(this.profiles.size + 1)}`
    const profile: AccountProfile = {
      id,
      name: profileName,
      codexHomeDir: join(getBaseCodexHomeDir(), 'codex-web-local', 'profiles', id),
      createdAt: nowIso,
      updatedAt: nowIso,
      lastUsedAt: null,
    }

    this.profiles.set(profile.id, profile)
    const activeProfile = this.activeProfileId ? this.profiles.get(this.activeProfileId) : null
    await this.ensureProfileDirectory(profile.codexHomeDir)
    await this.syncConversationArtifacts(activeProfile?.codexHomeDir ?? null, profile.codexHomeDir)
    this.queueFlush()
    return profile
  }

  async setActive(profileId: string): Promise<AccountProfile> {
    await this.ensureLoaded()
    const normalizedProfileId = readText(profileId)
    const profile = this.profiles.get(normalizedProfileId)
    if (!profile) {
      throw new Error(`Account profile not found: ${normalizedProfileId || 'unknown'}`)
    }

    const nowIso = new Date().toISOString()
    const previousActiveProfile = this.activeProfileId ? this.profiles.get(this.activeProfileId) : null
    await this.ensureProfileDirectory(profile.codexHomeDir)
    await this.syncConversationArtifacts(previousActiveProfile?.codexHomeDir ?? null, profile.codexHomeDir)
    profile.lastUsedAt = nowIso
    profile.updatedAt = nowIso
    this.activeProfileId = profile.id
    this.queueFlush()
    return profile
  }
}
