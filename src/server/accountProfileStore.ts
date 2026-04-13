import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export type AccountProfile = {
  id: string
  name: string
  codexHomeDir: string
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
}

type PersistedAccountProfiles = {
  version: 1
  activeProfileId: string | null
  profiles: AccountProfile[]
}

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

type ProfileAuthSummary = {
  hasAuth: boolean
  email: string | null
  authMode: 'chatgpt' | 'apiKey' | null
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
  private readonly ledgerPath = getProfilesLedgerPath()
  private loaded = false
  private activeProfileId: string | null = null
  private readonly profiles = new Map<string, AccountProfile>()
  private flushChain: Promise<void> = Promise.resolve()

  private async ensureProfileDirectory(codexHomeDir: string): Promise<void> {
    await mkdir(codexHomeDir, { recursive: true })
  }

  private async syncConversationArtifacts(sourceCodexHomeDir: string | null, targetCodexHomeDir: string): Promise<void> {
    const source = readText(sourceCodexHomeDir)
    const target = readText(targetCodexHomeDir)
    if (!source || !target) return
    if (resolve(source) === resolve(target)) return

    const artifacts: Array<{
      relativePath: string
      mode: 'prefer_larger_file' | 'if_target_missing'
    }> = [
      { relativePath: 'state_5.sqlite', mode: 'prefer_larger_file' },
      { relativePath: 'logs_1.sqlite', mode: 'prefer_larger_file' },
      { relativePath: 'session_index.jsonl', mode: 'prefer_larger_file' },
      { relativePath: 'archived_sessions', mode: 'if_target_missing' },
      { relativePath: 'shared-sessions', mode: 'if_target_missing' },
    ]

    for (const artifact of artifacts) {
      const { relativePath, mode } = artifact
      const sourcePath = join(source, relativePath)
      const targetPath = join(target, relativePath)
      try {
        const sourceStat = await stat(sourcePath)
        if (mode === 'if_target_missing') {
          try {
            await stat(targetPath)
            continue
          } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : ''
            if (!message.includes('enoent')) throw error
          }
        } else {
          if (!sourceStat.isFile()) continue
          try {
            const targetStat = await stat(targetPath)
            if (!targetStat.isFile()) continue
            if (sourceStat.size <= targetStat.size) continue
          } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : ''
            if (!message.includes('enoent')) throw error
          }
        }

        await cp(sourcePath, targetPath, {
          recursive: true,
          force: true,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : ''
        if (message.includes('enoent')) continue
        console.warn(`[codex-web-local] Failed to sync profile artifact "${relativePath}":`, error)
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
          return { hasAuth: false, email: null, authMode: null }
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
        }
      } catch {
        return { hasAuth: false, email: null, authMode: null }
      }
    }

    const visibleRows = await Promise.all(snapshot.profiles.map(async (profile) => {
      const authSummary = await readProfileAuthSummary(profile)
      const isActive = profile.id === snapshot.activeProfileId
      const accountSuffix = authSummary.email
        ? authSummary.email
        : (authSummary.authMode === 'apiKey' ? 'API Key' : '')
      const decoratedName = (!isActive && accountSuffix && !profile.name.includes(accountSuffix))
        ? `${profile.name} · ${accountSuffix}`
        : profile.name
      const decoratedProfile = decoratedName === profile.name
        ? profile
        : { ...profile, name: decoratedName }

      if (profile.id === snapshot.activeProfileId) {
        return { profile: decoratedProfile, visible: true }
      }
      return {
        profile: decoratedProfile,
        visible: authSummary.hasAuth,
      }
    }))

    return {
      activeProfileId: snapshot.activeProfileId,
      profiles: visibleRows
        .filter((row) => row.visible)
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
