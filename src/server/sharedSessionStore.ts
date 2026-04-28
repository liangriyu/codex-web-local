import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { SharedSessionSnapshot } from './sharedSessionSnapshot'

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT'
}

function parseTimestampMs(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function getSharedSessionSnapshotDirectory(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  const baseDir = codexHome && codexHome.length > 0
    ? resolve(codexHome)
    : resolve(homedir(), '.codex')
  return join(baseDir, 'shared-sessions')
}

export function normalizeSharedSessionId(sessionId: string): string {
  const normalized = sessionId
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^\.+/u, '')

  if (!normalized || normalized === '.' || normalized === '..') {
    return 'session'
  }

  return normalized
}

export function resolveSharedSessionSnapshotPath(sessionId: string): string {
  return join(
    getSharedSessionSnapshotDirectory(),
    `${normalizeSharedSessionId(sessionId)}.json`,
  )
}

async function readJsonSnapshot(path: string): Promise<SharedSessionSnapshot | null> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as SharedSessionSnapshot
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
}

export async function readSharedSessionSnapshot(sessionId: string): Promise<SharedSessionSnapshot | null> {
  return readJsonSnapshot(resolveSharedSessionSnapshotPath(sessionId))
}

export async function writeSharedSessionSnapshot(snapshot: SharedSessionSnapshot): Promise<void> {
  const path = resolveSharedSessionSnapshotPath(snapshot.sessionId)
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })

  const tempPath = join(
    directory,
    `.${normalizeSharedSessionId(snapshot.sessionId)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
  )

  try {
    await writeFile(tempPath, JSON.stringify(snapshot, null, 2), 'utf8')
    await rename(tempPath, path)
  } catch (error) {
    try {
      await rm(tempPath, { force: true })
    } catch {
      // Ignore cleanup errors; callers will see the original failure.
    }
    throw error
  }
}

export async function listSharedSessionSnapshots(): Promise<SharedSessionSnapshot[]> {
  const directory = getSharedSessionSnapshotDirectory()
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const snapshotFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)

    const snapshots: SharedSessionSnapshot[] = []
    for (const fileName of snapshotFiles) {
      try {
        const snapshot = await readJsonSnapshot(join(directory, fileName))
        if (snapshot) {
          snapshots.push(snapshot)
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          continue
        }
        throw error
      }
    }

    snapshots.sort((first, second) => first.sessionId.localeCompare(second.sessionId))
    return snapshots
  } catch (error) {
    if (isMissingFileError(error)) return []
    throw error
  }
}

export function isSharedSessionOwnerLeaseExpired(
  snapshot: Pick<SharedSessionSnapshot, 'ownerLeaseExpiresAtIso'>,
  now = new Date(),
): boolean {
  const expiresAtMs = parseTimestampMs(snapshot.ownerLeaseExpiresAtIso)
  if (expiresAtMs === null) return false
  return expiresAtMs <= now.getTime()
}
