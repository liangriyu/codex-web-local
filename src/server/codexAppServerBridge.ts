import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir, platform, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

// @ts-ignore - tests import this TypeScript module directly via node:test.
import type { ThreadReadResponse } from '../api/appServerDtos.ts'
import {
  normalizeActiveTurnIdV2,
  normalizeThreadFileChangeTimelineV2,
  normalizeThreadInProgressV2,
  normalizeThreadMessagesV2,
// @ts-ignore - tests import this TypeScript module directly via node:test.
} from '../api/normalizers/v2.ts'
// @ts-ignore - tests import this TypeScript module directly via node:test.
import { buildSharedSessionSnapshot } from './sharedSessionProjector.ts'
import {
  listSharedSessionSnapshots,
  readSharedSessionSnapshot,
  writeSharedSessionSnapshot,
// @ts-ignore - tests import this TypeScript module directly via node:test.
} from './sharedSessionStore.ts'
import {
  readThreadFileChangesFallbackFromSessionPath,
  readThreadFileChangesTimelineFromSessionPath,
// @ts-ignore - tests import this TypeScript module directly via node:test.
} from './threadFileChangesFallback.ts'
// @ts-ignore - tests import this TypeScript module directly via node:test.
import { mergeThreadFileChangeTimelines } from '../utils/threadFileChanges.ts'
import {
  MAX_AUDIO_BYTES,
  createTranscriptionService,
  TranscriptionServiceError,
  type VoiceInputFallbackConfig,
} from './transcriptionService.js'
import {
  buildMobileAuthRelayUrl,
  MobileAuthSessionStore,
  normalizePublicBaseUrl,
  rewriteAuthUrlForMobileCallback,
  type MobileAuthSessionStatus,
// @ts-ignore - tests import this TypeScript module directly via node:test.
} from './mobileAuthSessionStore.js'

type JsonRpcCall = {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

type JsonRpcResponse = {
  id?: number
  result?: unknown
  error?: {
    code: number
    message: string
  }
  method?: string
  params?: unknown
}

type RpcProxyRequest = {
  method: string
  params?: unknown
}

type ServerRequestReply = {
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

type PendingServerRequest = {
  id: number
  method: string
  params: unknown
  receivedAtIso: string
  threadId: string
}

type PersistedServerRequest = {
  id: number
  method: string
  threadId: string
  turnId: string
  itemId: string
  cwd: string
  params: unknown
  receivedAtIso: string
  resolvedAtIso: string | null
  resolutionKind: string | null
  dismissedAtIso: string | null
  dismissedReason: string | null
  dismissedBy: 'user' | null
}

const PERSISTED_SERVER_REQUEST_UNRESOLVED_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PERSISTED_SERVER_REQUEST_RESOLVED_RETENTION_MS = 24 * 60 * 60 * 1000
const SHARED_SESSION_NOTIFICATION_TRIGGER_METHODS = new Set([
  'turn/started',
  'turn/completed',
  'turn/interrupted',
])
const SHARED_SESSION_RPC_TRIGGER_METHODS = new Set([
  'turn/start',
  'turn/interrupt',
  'thread/resume',
  'thread/start',
])
const PRIVATE_VOICE_INPUT_CAPABILITY_METHOD = 'web-local/voice-input/capability/read'
const PRIVATE_VOICE_INPUT_TRANSCRIPTION_METHOD = 'web-local/voice-input/transcription/create'
const PRIVATE_BROWSER_OPEN_METHOD = 'web-local/browser/open'
const WEB_LOCAL_MOBILE_DIRECT_AUTH_AVAILABLE_KEY = 'codex_web_local_mobile_direct_auth_available'
const WEB_LOCAL_PUBLIC_BASE_URL_KEY = 'codex_web_local_public_base_url'
const PRIVATE_RPC_METHODS = [
  PRIVATE_VOICE_INPUT_CAPABILITY_METHOD,
  PRIVATE_VOICE_INPUT_TRANSCRIPTION_METHOD,
  PRIVATE_BROWSER_OPEN_METHOD,
]

type MobileChatgptLoginStartResult = {
  loginSessionId: string
  authUrl: string
  expiresAt: string
}

type MobileChatgptLoginStatusResult = {
  loginSessionId: string
  status: MobileAuthSessionStatus
  expiresAt: string | null
  error: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message
  }

  const record = asRecord(payload)
  if (!record) return fallback

  const error = record.error
  if (typeof error === 'string' && error.length > 0) return error

  const nestedError = asRecord(error)
  if (nestedError && typeof nestedError.message === 'string' && nestedError.message.length > 0) {
    return nestedError.message
  }

  return fallback
}

type ThreadFileChangeActionErrorCode =
  | 'no_reversible_turn'
  | 'workspace_not_clean'
  | 'patch_conflict'

class ThreadFileChangeActionError extends Error {
  readonly code: ThreadFileChangeActionErrorCode
  readonly statusCode: number

  constructor(code: ThreadFileChangeActionErrorCode, message: string, statusCode: number) {
    super(message)
    this.name = 'ThreadFileChangeActionError'
    this.code = code
    this.statusCode = statusCode
  }
}

function isThreadFileChangeActionError(error: unknown): error is ThreadFileChangeActionError {
  return error instanceof ThreadFileChangeActionError
}

function setThreadFileChangeActionError(
  res: ServerResponse,
  error: ThreadFileChangeActionError,
): void {
  setJson(res, error.statusCode, {
    error: {
      code: error.code,
      message: error.message,
    },
  })
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function setHtml(res: ServerResponse, statusCode: number, html: string): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(html)
}

class PrivateRpcError extends Error {
  readonly code: number
  readonly statusCode: number

  constructor(code: number, message: string, statusCode: number) {
    super(message)
    this.name = 'PrivateRpcError'
    this.code = code
    this.statusCode = statusCode
  }
}

function openUrlInHostBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (platform() === 'darwin') {
      execFile('open', [url], (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
      return
    }

    if (platform() === 'win32') {
      execFile('cmd', ['/c', 'start', '', url], (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
      return
    }

    execFile('xdg-open', [url], (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function normalizePreviewPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  if (isAbsolute(trimmed)) return resolve(trimmed)
  return resolve(process.cwd(), trimmed)
}

function getPersistedServerRequestsLedgerPath(): string {
  const codexHome = process.env.CODEX_HOME?.trim()
  const baseDir = codexHome && codexHome.length > 0
    ? codexHome
    : join(homedir(), '.codex')
  return join(baseDir, 'codex-web-local', 'persisted-server-requests.json')
}

function parseTimestampMs(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function readPendingServerRequestThreadId(params: unknown): string {
  const record = asRecord(params)
  if (!record) return ''
  return (
    readText(record.threadId) ||
    readText(record.thread_id) ||
    readText(record.conversationId) ||
    readText(record.conversation_id)
  )
}

function readNotificationThreadId(params: unknown): string {
  const record = asRecord(params)
  if (!record) return ''

  const directThreadId = readText(record.threadId)
  if (directThreadId) return directThreadId

  const snakeThreadId = readText(record.thread_id)
  if (snakeThreadId) return snakeThreadId

  const conversationId = readText(record.conversationId)
  if (conversationId) return conversationId

  const snakeConversationId = readText(record.conversation_id)
  if (snakeConversationId) return snakeConversationId

  const thread = asRecord(record.thread)
  const nestedThreadId = readText(thread?.id)
  if (nestedThreadId) return nestedThreadId

  const turn = asRecord(record.turn)
  const turnThreadId = readText(turn?.threadId)
  if (turnThreadId) return turnThreadId

  return readText(turn?.thread_id)
}

function readThreadIdFromRpcPayload(method: string, params: unknown, result: unknown): string {
  if (!SHARED_SESSION_RPC_TRIGGER_METHODS.has(method)) return ''

  const paramRecord = asRecord(params)
  const directThreadId = readText(paramRecord?.threadId)
  if (directThreadId) return directThreadId

  if (method !== 'thread/start') return ''
  const resultRecord = asRecord(result)
  const thread = asRecord(resultRecord?.thread)
  return readText(thread?.id)
}

function readRequestThreadId(request: { threadId?: string; params: unknown }): string {
  return readText(request.threadId) || readPendingServerRequestThreadId(request.params)
}

function toProjectorPendingServerRequest(
  request: PendingServerRequest,
): {
  id: number
  method: string
  threadId: string
  turnId: string
  itemId: string
  receivedAtIso: string
  params: unknown
} {
  const requestParams = asRecord(request.params)
  return {
    id: request.id,
    method: request.method,
    threadId: readRequestThreadId(request),
    turnId: readText(requestParams?.turnId),
    itemId: readText(requestParams?.itemId),
    receivedAtIso: request.receivedAtIso,
    params: request.params,
  }
}

function readThreadTitle(thread: Record<string, unknown>): string {
  const candidates = [
    thread.name,
    thread.preview,
  ]

  for (const candidate of candidates) {
    const title = readText(candidate)
    if (title.length > 0) {
      return title
    }
  }

  return 'Untitled thread'
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message
        reject(new Error(message))
        return
      }
      resolve(stdout)
    })
  })
}

function runGitWithInput(args: string[], cwd: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message
        reject(new Error(message))
        return
      }
      resolve(stdout)
    })
    child.stdin?.end(input)
  })
}

type WorkspaceFileChange = {
  path: string
  additions: number
  deletions: number
  diff: string
}

type WorkspaceDiffMode =
  | 'unstaged'
  | 'staged'
  | 'branch'
  | 'lastCommit'
  | 'gitStatus'

type WorkspaceDiffSnapshot = {
  mode: WorkspaceDiffMode
  cwd: string
  label: string
  baseRef: string | null
  targetRef: string | null
  warning: string | null
  files: WorkspaceFileChange[]
  totalAdditions: number
  totalDeletions: number
}

type ServerSideWorkspaceGuardBlockedReason =
  | 'not_repo'
  | 'workspace_dirty'
  | 'pending_server_requests'
  | 'persisted_server_requests'
  | 'unresolved_server_request_scope'

type ServerSideWorkspaceGuard = {
  cwd: string
  isRepo: boolean
  blockedReasons: ServerSideWorkspaceGuardBlockedReason[]
}

type ResolvedRequestWorkspace = {
  cwd: string
  unresolvedScope: boolean
}

type WorkspaceDirtyKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted'
  | 'unknown'

type WorkspaceDirtyEntry = {
  path: string
  x: string
  y: string
  kind: WorkspaceDirtyKind
  staged: boolean
  unstaged: boolean
}

type WorkspaceDirtySummary = {
  trackedModified: number
  staged: number
  untracked: number
  conflicted: number
  renamed: number
  deleted: number
}

type WorkspaceGitStatus = {
  cwd: string
  isRepo: boolean
  isDirty: boolean
  currentBranch: string
  dirtySummary: WorkspaceDirtySummary
  dirtyEntries: WorkspaceDirtyEntry[]
}

type WorkspacePushMetadata = {
  cwd: string
  isRepo: boolean
  currentBranch: string
  hasUpstream: boolean
  willSetUpstream: boolean
  upstreamRemote: string
  upstreamBranch: string
  aheadCount: number
  behindCount: number
  hasCommitsToPush: boolean
  canPush: boolean
  suggestedUpstreamCommand: string
}

const EMPTY_WORKSPACE_DIRTY_SUMMARY: WorkspaceDirtySummary = {
  trackedModified: 0,
  staged: 0,
  untracked: 0,
  conflicted: 0,
  renamed: 0,
  deleted: 0,
}

function parseNumstat(output: string): Array<{ path: string; additions: number; deletions: number }> {
  const rows: Array<{ path: string; additions: number; deletions: number }> = []
  const lines = output.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
  for (const line of lines) {
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const additions = Number.parseInt(parts[0], 10)
    const deletions = Number.parseInt(parts[1], 10)
    rows.push({
      path: parts.slice(2).join('\t'),
      additions: Number.isFinite(additions) ? additions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0,
    })
  }
  return rows
}

function normalizeWorkspaceDiffMode(value: string): WorkspaceDiffMode | null {
  const normalized = value.trim()
  if (
    normalized === 'unstaged' ||
    normalized === 'staged' ||
    normalized === 'branch' ||
    normalized === 'lastCommit' ||
    normalized === 'gitStatus'
  ) {
    return normalized
  }
  return null
}

function isConflictStatus(x: string, y: string): boolean {
  if (x === 'U' || y === 'U') return true
  const pair = `${x}${y}`
  return pair === 'DD' || pair === 'AA'
}

function classifyWorkspaceDirtyKind(x: string, y: string, path: string): WorkspaceDirtyKind {
  if (!path) return 'unknown'
  if (x === '?' && y === '?') return 'untracked'
  if (isConflictStatus(x, y)) return 'conflicted'
  if (x === 'R' || y === 'R' || x === 'C' || y === 'C') return 'renamed'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'A' || y === 'A') return 'added'
  if (
    x === 'M' || y === 'M' ||
    x === 'T' || y === 'T'
  ) {
    return 'modified'
  }
  return 'unknown'
}

function normalizeStatusPathSegment(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  const renameSeparator = ' -> '
  if (trimmed.includes(renameSeparator)) {
    const [, nextPath = ''] = trimmed.split(renameSeparator)
    return nextPath.trim()
  }
  return trimmed
}

function parseWorkspaceDirtyEntries(output: string): WorkspaceDirtyEntry[] {
  const lines = output.split('\n').filter((line) => line.trim().length > 0)
  const entries: WorkspaceDirtyEntry[] = []
  for (const line of lines) {
    if (line.length < 3) continue
    const x = line[0] ?? ' '
    const y = line[1] ?? ' '
    const path = normalizeStatusPathSegment(line.slice(3))
    if (!path) continue
    entries.push({
      path,
      x,
      y,
      kind: classifyWorkspaceDirtyKind(x, y, path),
      staged: x !== ' ' && x !== '?',
      unstaged: y !== ' ' && y !== '?',
    })
  }
  return entries.sort((first, second) => first.path.localeCompare(second.path))
}

function summarizeWorkspaceDirtyEntries(entries: WorkspaceDirtyEntry[]): WorkspaceDirtySummary {
  const summary: WorkspaceDirtySummary = { ...EMPTY_WORKSPACE_DIRTY_SUMMARY }
  for (const entry of entries) {
    if (entry.staged) {
      summary.staged += 1
    }
    if (entry.kind === 'untracked') {
      summary.untracked += 1
      continue
    }
    if (entry.kind === 'conflicted') {
      summary.conflicted += 1
      continue
    }
    if (entry.kind === 'renamed') {
      summary.renamed += 1
      continue
    }
    if (entry.kind === 'deleted') {
      summary.deleted += 1
      continue
    }
    summary.trackedModified += 1
  }
  return summary
}

async function readWorkspaceSubmodulePaths(cwd: string): Promise<Set<string>> {
  try {
    const output = await runGit(['submodule', 'status', '--recursive'], cwd)
    const paths = new Set<string>()
    for (const rawLine of output.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      const match = line.match(/^[+\-U ]?[0-9a-f]{40}\s+(.+?)(?:\s+\(.*\))?$/iu)
      if (!match) continue
      const path = match[1]?.trim()
      if (path) {
        paths.add(normalizeStatusPathSegment(path))
      }
    }
    return paths
  } catch {
    return new Set<string>()
  }
}

async function collectWorkspaceChanges(cwd: string): Promise<WorkspaceFileChange[]> {
  const targetCwd = resolve(cwd)
  await runGit(['rev-parse', '--is-inside-work-tree'], targetCwd)

  const [unstagedNumstat, stagedNumstat] = await Promise.all([
    runGit(['diff', '--numstat'], targetCwd),
    runGit(['diff', '--cached', '--numstat'], targetCwd),
  ])

  const merged = new Map<string, WorkspaceFileChange>()
  for (const row of [...parseNumstat(unstagedNumstat), ...parseNumstat(stagedNumstat)]) {
    const existing = merged.get(row.path)
    if (existing) {
      existing.additions += row.additions
      existing.deletions += row.deletions
      continue
    }
    merged.set(row.path, {
      path: row.path,
      additions: row.additions,
      deletions: row.deletions,
      diff: '',
    })
  }

  for (const file of merged.values()) {
    const [stagedDiff, unstagedDiff] = await Promise.all([
      runGit(['diff', '--cached', '--', file.path], targetCwd).catch(() => ''),
      runGit(['diff', '--', file.path], targetCwd).catch(() => ''),
    ])
    file.diff = [stagedDiff.trimEnd(), unstagedDiff.trimEnd()].filter((part) => part.length > 0).join('\n')
  }

  return Array.from(merged.values()).sort((first, second) => first.path.localeCompare(second.path))
}

async function collectWorkspaceChangesForDiffArgs(
  cwd: string,
  numstatArgs: string[],
  diffArgsForPath: (path: string) => string[],
): Promise<WorkspaceFileChange[]> {
  const targetCwd = resolve(cwd)
  await runGit(['rev-parse', '--is-inside-work-tree'], targetCwd)

  const numstatOutput = await runGit(numstatArgs, targetCwd)
  const rows = parseNumstat(numstatOutput)
  const files: WorkspaceFileChange[] = new Array(rows.length)

  // Limit the number of concurrent git diff processes to avoid overwhelming the system
  const maxConcurrentDiffs = 4
  let currentIndex = 0

  async function worker(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const index = currentIndex++
      if (index >= rows.length) {
        break
      }
      const row = rows[index]
      const diff = await runGit(diffArgsForPath(row.path), targetCwd).catch(() => '')
      files[index] = {
        path: row.path,
        additions: row.additions,
        deletions: row.deletions,
        diff: diff.trimEnd(),
      }
    }
  }

  const workerCount = Math.min(maxConcurrentDiffs, rows.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return files.sort((first, second) => first.path.localeCompare(second.path))
}

async function refExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await runGit(['rev-parse', '--verify', `${ref}^{commit}`], cwd)
    return true
  } catch {
    return false
  }
}

async function resolveUpstreamRemote(cwd: string): Promise<string | null> {
  try {
    const upstream = (await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd)).trim()
    if (!upstream) return null
    const [remote] = upstream.split('/')
    return remote?.trim() || null
  } catch {
    return null
  }
}

async function resolveRemoteHeadBranch(
  cwd: string,
  remote: string,
): Promise<{ remote: string; ref: string; shortName: string } | null> {
  const normalizedRemote = remote.trim()
  if (!normalizedRemote) return null
  try {
    const symbolicRef = (
      await runGit(['symbolic-ref', '--quiet', '--short', `refs/remotes/${normalizedRemote}/HEAD`], cwd)
    ).trim()
    if (!symbolicRef || symbolicRef === `${normalizedRemote}/HEAD`) return null
    const shortName = symbolicRef.startsWith(`${normalizedRemote}/`)
      ? symbolicRef.slice(normalizedRemote.length + 1)
      : symbolicRef
    return {
      remote: normalizedRemote,
      ref: symbolicRef,
      shortName,
    }
  } catch {
    return null
  }
}

async function listRemoteHeadBranches(
  cwd: string,
): Promise<Array<{ remote: string; ref: string; shortName: string }>> {
  try {
    const output = await runGit(['for-each-ref', 'refs/remotes', '--format=%(refname:short)'], cwd)
    const remotes = new Set<string>()
    for (const line of output.split('\n')) {
      const normalized = line.trim()
      if (!normalized.endsWith('/HEAD')) continue
      const remote = normalized.slice(0, -'/HEAD'.length).trim()
      if (remote) remotes.add(remote)
    }

    const resolved = await Promise.all(
      Array.from(remotes)
        .sort((first, second) => first.localeCompare(second))
        .map((remote) => resolveRemoteHeadBranch(cwd, remote)),
    )

    const deduped = new Map<string, { remote: string; ref: string; shortName: string }>()
    for (const candidate of resolved) {
      if (!candidate) continue
      if (!deduped.has(candidate.ref)) {
        deduped.set(candidate.ref, candidate)
      }
    }
    return Array.from(deduped.values())
  } catch {
    return []
  }
}

function withConfiguredBaseBranchWarning(
  configuredBaseBranch: string,
  resolvedBaseBranch: string,
  note: string | null = null,
): string {
  const prefix = `Configured base branch ${configuredBaseBranch} not found`
  if (note) return `${prefix}; ${note}`
  return `${prefix}; using ${resolvedBaseBranch}`
}

async function resolveWorkspaceDiffBaseBranch(
  cwd: string,
  preferredBaseBranch: string | null,
): Promise<{ baseBranch: string | null; warning: string | null }> {
  const targetCwd = resolve(cwd)
  const normalizedPreferred = preferredBaseBranch?.trim() ?? ''
  if (normalizedPreferred) {
    if (await refExists(targetCwd, normalizedPreferred)) {
      return { baseBranch: normalizedPreferred, warning: null }
    }
  }

  const upstreamRemote = await resolveUpstreamRemote(targetCwd)
  if (upstreamRemote) {
    const upstreamRemoteHead = await resolveRemoteHeadBranch(targetCwd, upstreamRemote)
    if (upstreamRemoteHead) {
      return {
        baseBranch: upstreamRemoteHead.ref,
        warning: normalizedPreferred
          ? withConfiguredBaseBranchWarning(normalizedPreferred, upstreamRemoteHead.ref)
          : null,
      }
    }
  }

  const originRemoteHead = await resolveRemoteHeadBranch(targetCwd, 'origin')
  if (originRemoteHead) {
    return {
      baseBranch: originRemoteHead.ref,
      warning: normalizedPreferred
        ? withConfiguredBaseBranchWarning(normalizedPreferred, originRemoteHead.ref)
        : null,
    }
  }

  const remoteHeads = await listRemoteHeadBranches(targetCwd)
  if (remoteHeads.length > 0) {
    const chosenRemoteHead = remoteHeads[0]
    const fallbackWarning = remoteHeads.length > 1
      ? `Multiple local remote HEADs found; using ${chosenRemoteHead.ref}`
      : `Using local remote HEAD ${chosenRemoteHead.ref}`
    return {
      baseBranch: chosenRemoteHead.ref,
      warning: normalizedPreferred
        ? withConfiguredBaseBranchWarning(normalizedPreferred, chosenRemoteHead.ref, fallbackWarning)
        : fallbackWarning,
    }
  }

  for (const candidate of ['main', 'master', 'develop', 'dev', 'trunk']) {
    if (await refExists(targetCwd, candidate)) {
      return {
        baseBranch: candidate,
        warning: normalizedPreferred
          ? withConfiguredBaseBranchWarning(normalizedPreferred, candidate, `using local branch ${candidate}`)
          : `Remote HEAD not found; using local branch ${candidate}`,
      }
    }
  }

  return {
    baseBranch: null,
    warning: normalizedPreferred
      ? `Configured base branch ${normalizedPreferred} not found; unable to infer a base branch from local Git metadata`
      : 'Unable to infer a base branch from local Git metadata',
  }
}

function summarizeWorkspaceFileChanges(files: WorkspaceFileChange[]): Pick<WorkspaceDiffSnapshot, 'totalAdditions' | 'totalDeletions'> {
  return {
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
  }
}

async function collectWorkspaceDiffSnapshot(
  cwd: string,
  mode: WorkspaceDiffMode,
  options: { baseBranch?: string | null } = {},
): Promise<WorkspaceDiffSnapshot> {
  const targetCwd = resolve(cwd)
  await runGit(['rev-parse', '--is-inside-work-tree'], targetCwd)

  if (mode === 'unstaged') {
    const files = await collectWorkspaceChangesForDiffArgs(
      targetCwd,
      ['diff', '--numstat'],
      (path) => ['diff', '--', path],
    )
    const totals = summarizeWorkspaceFileChanges(files)
    return {
      mode,
      cwd: targetCwd,
      label: 'Unstaged changes',
      baseRef: null,
      targetRef: 'WORKTREE',
      warning: null,
      files,
      ...totals,
    }
  }

  if (mode === 'staged') {
    const files = await collectWorkspaceChangesForDiffArgs(
      targetCwd,
      ['diff', '--cached', '--numstat'],
      (path) => ['diff', '--cached', '--', path],
    )
    const totals = summarizeWorkspaceFileChanges(files)
    return {
      mode,
      cwd: targetCwd,
      label: 'Staged changes',
      baseRef: 'HEAD',
      targetRef: 'INDEX',
      warning: null,
      files,
      ...totals,
    }
  }

  if (mode === 'lastCommit') {
    const files = await collectWorkspaceChangesForDiffArgs(
      targetCwd,
      ['show', '--format=', '--numstat', 'HEAD'],
      (path) => ['show', '--format=', 'HEAD', '--', path],
    )
    const totals = summarizeWorkspaceFileChanges(files)
    return {
      mode,
      cwd: targetCwd,
      label: 'Last commit',
      baseRef: 'HEAD~1',
      targetRef: 'HEAD',
      warning: null,
      files,
      ...totals,
    }
  }

  if (mode === 'gitStatus') {
    const status = await readWorkspaceGitStatus(targetCwd)
    return {
      mode,
      cwd: targetCwd,
      label: 'Git status',
      baseRef: null,
      targetRef: status.currentBranch || 'WORKTREE',
      warning: null,
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
    }
  }

  const { baseBranch, warning } = await resolveWorkspaceDiffBaseBranch(targetCwd, options.baseBranch ?? null)
  if (!baseBranch) {
    return {
      mode,
      cwd: targetCwd,
      label: 'Branch changes',
      baseRef: null,
      targetRef: 'HEAD',
      warning,
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
    }
  }

  const mergeBase = (await runGit(['merge-base', baseBranch, 'HEAD'], targetCwd)).trim()
  const files = await collectWorkspaceChangesForDiffArgs(
    targetCwd,
    ['diff', '--numstat', mergeBase, 'HEAD'],
    (path) => ['diff', mergeBase, 'HEAD', '--', path],
  )
  const totals = summarizeWorkspaceFileChanges(files)
  return {
    mode,
    cwd: targetCwd,
    label: `Branch changes vs ${baseBranch}`,
    baseRef: baseBranch,
    targetRef: 'HEAD',
    warning,
    files,
    ...totals,
  }
}

async function collectWorkspaceUnifiedDiff(cwd: string): Promise<string> {
  const targetCwd = resolve(cwd)
  await runGit(['rev-parse', '--is-inside-work-tree'], targetCwd)
  const [stagedDiff, unstagedDiff] = await Promise.all([
    runGit(['diff', '--cached'], targetCwd).catch(() => ''),
    runGit(['diff'], targetCwd).catch(() => ''),
  ])
  return [stagedDiff.trimEnd(), unstagedDiff.trimEnd()].filter((part) => part.length > 0).join('\n')
}

async function isGitWorkspace(cwd: string): Promise<boolean> {
  try {
    const output = await runGit(['rev-parse', '--is-inside-work-tree'], resolve(cwd))
    return output.trim() === 'true'
  } catch {
    return false
  }
}

async function readWorkspaceGitStatus(cwd: string): Promise<WorkspaceGitStatus> {
  const targetCwd = resolve(cwd)
  const isRepo = await isGitWorkspace(targetCwd)
  if (!isRepo) {
    return {
      cwd: targetCwd,
      isRepo: false,
      isDirty: false,
      currentBranch: '',
      dirtySummary: { ...EMPTY_WORKSPACE_DIRTY_SUMMARY },
      dirtyEntries: [],
    }
  }

  const [statusOutput, branchOutput, submodulePaths] = await Promise.all([
    runGit(['status', '--porcelain=v1', '-uall', '--ignore-submodules=dirty'], targetCwd),
    runGit(['branch', '--show-current'], targetCwd).catch(() => ''),
    readWorkspaceSubmodulePaths(targetCwd),
  ])
  const dirtyEntries = parseWorkspaceDirtyEntries(statusOutput)
    .filter((entry) => !submodulePaths.has(entry.path))

  return {
    cwd: targetCwd,
    isRepo: true,
    isDirty: dirtyEntries.length > 0,
    currentBranch: branchOutput.trim(),
    dirtySummary: summarizeWorkspaceDirtyEntries(dirtyEntries),
    dirtyEntries,
  }
}

async function readWorkspaceBranches(cwd: string): Promise<{
  cwd: string
  isRepo: boolean
  currentBranch: string
  branches: string[]
}> {
  const targetCwd = resolve(cwd)
  const status = await readWorkspaceGitStatus(targetCwd)
  if (!status.isRepo) {
    return {
      cwd: targetCwd,
      isRepo: false,
      currentBranch: '',
      branches: [],
    }
  }

  const output = await runGit(['branch', '--list', '--format=%(refname:short)'], targetCwd)
  const branches = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((first, second) => first.localeCompare(second))

  return {
    cwd: targetCwd,
    isRepo: true,
    currentBranch: status.currentBranch,
    branches,
  }
}

async function assertGitWorkspace(cwd: string): Promise<string> {
  const targetCwd = resolve(cwd)
  if (!(await isGitWorkspace(targetCwd))) {
    throw new Error('Target cwd is not a git repository')
  }
  return targetCwd
}

async function assertValidBranchName(branch: string): Promise<string> {
  const normalizedBranch = branch.trim()
  if (!normalizedBranch) {
    throw new Error('Branch name is required')
  }

  try {
    await runGit(['check-ref-format', '--branch', normalizedBranch], process.cwd())
  } catch {
    throw new Error('Invalid branch name')
  }

  return normalizedBranch
}

async function switchWorkspaceBranch(cwd: string, branch: string): Promise<void> {
  const targetCwd = await assertGitWorkspace(cwd)
  const normalizedBranch = await assertValidBranchName(branch)
  await runGit(['switch', normalizedBranch], targetCwd)
}

async function createAndSwitchWorkspaceBranch(cwd: string, branch: string): Promise<void> {
  const targetCwd = await assertGitWorkspace(cwd)
  const normalizedBranch = await assertValidBranchName(branch)
  await runGit(['switch', '-c', normalizedBranch], targetCwd)
}

async function readGitRemoteNames(cwd: string): Promise<string[]> {
  try {
    const output = await runGit(['remote'], cwd)
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  } catch {
    return []
  }
}

function parseUpstreamRef(upstreamRef: string): { upstreamRemote: string; upstreamBranch: string } {
  const normalized = upstreamRef.trim()
  if (!normalized) {
    return { upstreamRemote: '', upstreamBranch: '' }
  }

  const separatorIndex = normalized.indexOf('/')
  if (separatorIndex === -1) {
    return { upstreamRemote: '', upstreamBranch: normalized }
  }

  return {
    upstreamRemote: normalized.slice(0, separatorIndex).trim(),
    upstreamBranch: normalized.slice(separatorIndex + 1).trim(),
  }
}

async function resolveSuggestedUpstreamRemote(cwd: string): Promise<string> {
  const remoteNames = await readGitRemoteNames(cwd)
  if (remoteNames.includes('origin')) {
    return 'origin'
  }
  return remoteNames[0] ?? 'origin'
}

function isMissingUpstreamError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('no upstream configured')
    || message.includes('has no upstream branch')
    || message.includes('no upstream branch')
}

async function resolveWorkspacePushMetadata(cwd: string): Promise<WorkspacePushMetadata> {
  const targetCwd = resolve(cwd)
  const isRepo = await isGitWorkspace(targetCwd)
  if (!isRepo) {
    return {
      cwd: targetCwd,
      isRepo: false,
      currentBranch: '',
      hasUpstream: false,
      willSetUpstream: false,
      upstreamRemote: '',
      upstreamBranch: '',
      aheadCount: 0,
      behindCount: 0,
      hasCommitsToPush: false,
      canPush: false,
      suggestedUpstreamCommand: '',
    }
  }

  const currentBranch = (await runGit(['branch', '--show-current'], targetCwd).catch(() => '')).trim()
  if (!currentBranch) {
    return {
      cwd: targetCwd,
      isRepo: true,
      currentBranch: '',
      hasUpstream: false,
      willSetUpstream: false,
      upstreamRemote: '',
      upstreamBranch: '',
      aheadCount: 0,
      behindCount: 0,
      hasCommitsToPush: false,
      canPush: false,
      suggestedUpstreamCommand: '',
    }
  }

  let upstreamRef = ''
  try {
    upstreamRef = (await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], targetCwd)).trim()
  } catch (error) {
    if (!isMissingUpstreamError(error)) {
      throw error
    }
  }
  if (!upstreamRef) {
    const suggestedRemote = await resolveSuggestedUpstreamRemote(targetCwd)
    return {
      cwd: targetCwd,
      isRepo: true,
      currentBranch,
      hasUpstream: false,
      willSetUpstream: true,
      upstreamRemote: suggestedRemote,
      upstreamBranch: currentBranch,
      aheadCount: 0,
      behindCount: 0,
      hasCommitsToPush: true,
      canPush: true,
      suggestedUpstreamCommand: `git push --set-upstream ${suggestedRemote} ${currentBranch}`,
    }
  }

  const [aheadBehindOutput, remotes] = await Promise.all([
    runGit(['rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`], targetCwd),
    readGitRemoteNames(targetCwd),
  ])
  const [aheadRaw = '0', behindRaw = '0'] = aheadBehindOutput.trim().split(/\s+/)
  const aheadCount = Number.isFinite(Number.parseInt(aheadRaw, 10)) ? Math.max(0, Math.trunc(Number.parseInt(aheadRaw, 10))) : 0
  const behindCount = Number.isFinite(Number.parseInt(behindRaw, 10)) ? Math.max(0, Math.trunc(Number.parseInt(behindRaw, 10))) : 0
  const { upstreamRemote, upstreamBranch } = parseUpstreamRef(upstreamRef)
  const fallbackRemote = remotes.includes('origin') ? 'origin' : (remotes[0] ?? 'origin')

  return {
    cwd: targetCwd,
    isRepo: true,
    currentBranch,
    hasUpstream: true,
    willSetUpstream: false,
    upstreamRemote: upstreamRemote || fallbackRemote,
    upstreamBranch: upstreamBranch || currentBranch,
    aheadCount,
    behindCount,
    hasCommitsToPush: aheadCount > 0,
    canPush: aheadCount > 0,
    suggestedUpstreamCommand: '',
  }
}

async function pushWorkspaceBranch(cwd: string): Promise<{
  currentBranch: string
  upstreamRemote: string
  upstreamBranch: string
  createdUpstream: boolean
  summary: string
}> {
  const targetCwd = await assertGitWorkspace(cwd)
  const metadata = await resolveWorkspacePushMetadata(targetCwd)
  if (!metadata.currentBranch) {
    throw new Error('Current HEAD is detached; cannot push')
  }
  if (metadata.hasUpstream) {
    await runGit(['push'], targetCwd)
    return {
      currentBranch: metadata.currentBranch,
      upstreamRemote: metadata.upstreamRemote,
      upstreamBranch: metadata.upstreamBranch,
      createdUpstream: false,
      summary: `Pushed ${metadata.currentBranch} to ${metadata.upstreamRemote}/${metadata.upstreamBranch}`,
    }
  }

  const targetRemote = metadata.upstreamRemote || await resolveSuggestedUpstreamRemote(targetCwd)
  await runGit(['push', '--set-upstream', targetRemote, metadata.currentBranch], targetCwd)
  return {
    currentBranch: metadata.currentBranch,
    upstreamRemote: targetRemote,
    upstreamBranch: metadata.currentBranch,
    createdUpstream: true,
    summary: `Pushed ${metadata.currentBranch} to ${targetRemote}/${metadata.currentBranch} and set upstream`,
  }
}

async function readWorkspacePushStatus(cwd: string): Promise<WorkspacePushMetadata & { blockedReasons: string[] }> {
  const metadata = await resolveWorkspacePushMetadata(cwd)
  const guard = await getSharedBridgeState().appServer.getWorkspaceGuard(cwd)
  return {
    ...metadata,
    blockedReasons: guard.blockedReasons,
    canPush: metadata.canPush && guard.blockedReasons.length === 0,
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  if (chunks.length === 0) return null

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (raw.length === 0) return null

  return JSON.parse(raw) as unknown
}

class AppServerProcess {
  private process: ChildProcessWithoutNullStreams | null = null
  private initialized = false
  private readBuffer = ''
  private nextId = 1
  private stopping = false
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()
  private readonly notificationListeners = new Set<(value: { method: string; params: unknown }) => void>()
  private readonly pendingServerRequests = new Map<number, PendingServerRequest>()
  private readonly persistedServerRequests = new Map<number, PersistedServerRequest>()
  private readonly threadCwdById = new Map<string, string>()
  private readonly threadPathById = new Map<string, string>()
  private readonly latestThreadFileChangeStateByThreadId = new Map<string, 'applied' | 'reverted'>()
  private readonly persistedServerRequestsLedgerPath = getPersistedServerRequestsLedgerPath()
  private persistedServerRequestsLoaded: Promise<void> | null = null
  private persistedServerRequestsFlushChain: Promise<void> = Promise.resolve()
  private voiceInputFallbackConfig: VoiceInputFallbackConfig = {
    provider: 'openai',
    enabled: false,
    model: 'gpt-4o-mini-transcribe',
  }
  private publicBaseUrl: string | null = normalizePublicBaseUrl(process.env.PUBLIC_BASE_URL)
  private readonly mobileAuthSessionStore = new MobileAuthSessionStore()

  setVoiceInputFallbackConfig(config: VoiceInputFallbackConfig): void {
    this.voiceInputFallbackConfig = config
  }

  setPublicBaseUrl(value: string | null | undefined): void {
    this.publicBaseUrl = normalizePublicBaseUrl(value)
  }

  getPublicBaseUrl(): string | null {
    return this.publicBaseUrl
  }

  withWebLocalConfigSnapshot(payload: unknown): unknown {
    const record = asRecord(payload)
    const config = asRecord(record?.config)
    if (!record || !config) {
      return payload
    }

    return {
      ...record,
      config: {
        ...config,
        [WEB_LOCAL_MOBILE_DIRECT_AUTH_AVAILABLE_KEY]: Boolean(this.publicBaseUrl),
        [WEB_LOCAL_PUBLIC_BASE_URL_KEY]: this.publicBaseUrl,
      },
    }
  }

  async startMobileChatgptLogin(): Promise<MobileChatgptLoginStartResult> {
    const publicBaseUrl = this.getPublicBaseUrl()
    if (!publicBaseUrl) {
      throw new Error('Mobile direct auth is unavailable because PUBLIC_BASE_URL is not configured')
    }

    const payload = asRecord(await this.rpc('account/login/start', { type: 'chatgpt' }))
    if (payload?.type !== 'chatgpt') {
      throw new Error('account/login/start did not return a ChatGPT login flow')
    }

    const authUrl = readText(payload.authUrl)
    const appServerLoginId = readText(payload.loginId)
    if (!authUrl || !appServerLoginId) {
      throw new Error('account/login/start returned an incomplete ChatGPT login response')
    }

    const rewritten = rewriteAuthUrlForMobileCallback(authUrl, publicBaseUrl)
    const session = this.mobileAuthSessionStore.create({
      appServerLoginId,
      state: rewritten.state,
      originalCallbackUrl: rewritten.originalCallbackUrl,
      publicBaseUrlSnapshot: publicBaseUrl,
    })

    return {
      loginSessionId: session.loginSessionId,
      authUrl: rewritten.authUrl,
      expiresAt: session.expiresAt,
    }
  }

  getMobileChatgptLoginStatus(loginSessionId: string): MobileChatgptLoginStatusResult {
    const normalizedLoginSessionId = loginSessionId.trim()
    if (!normalizedLoginSessionId) {
      throw new Error('Missing login session id')
    }

    const status = this.mobileAuthSessionStore.readStatus(normalizedLoginSessionId, this.getPublicBaseUrl())
    if (!status) {
      return {
        loginSessionId: normalizedLoginSessionId,
        status: 'server_restarted',
        expiresAt: null,
        error: null,
      }
    }

    return status
  }

  async completeMobileChatgptCallback(callbackUrl: URL): Promise<{
    ok: boolean
    status: MobileAuthSessionStatus
    message: string
  }> {
    const state = readText(callbackUrl.searchParams.get('state'))
    if (!state) {
      return {
        ok: false,
        status: 'failed',
        message: 'ChatGPT callback is missing state',
      }
    }

    const session = this.mobileAuthSessionStore.readByState(state)
    if (!session) {
      return {
        ok: false,
        status: 'server_restarted',
        message: 'This login session is no longer available. Please restart the login flow.',
      }
    }

    const status = this.mobileAuthSessionStore.readStatus(session.loginSessionId, this.getPublicBaseUrl())
    if (!status) {
      return {
        ok: false,
        status: 'server_restarted',
        message: 'This login session is no longer available. Please restart the login flow.',
      }
    }
    if (status.status === 'expired') {
      return {
        ok: false,
        status: 'expired',
        message: 'This login session has expired. Please restart the login flow.',
      }
    }
    if (status.status === 'public_url_changed') {
      return {
        ok: false,
        status: 'public_url_changed',
        message: 'Public access URL changed during login. Please restart the login flow.',
      }
    }
    if (status.status === 'success') {
      return {
        ok: true,
        status: 'success',
        message: 'ChatGPT login already completed. You can return to the account center.',
      }
    }
    if (status.status === 'failed') {
      return {
        ok: false,
        status: 'failed',
        message: status.error ?? 'ChatGPT login did not complete',
      }
    }

    const oauthError = readText(callbackUrl.searchParams.get('error'))
    const oauthErrorDescription = readText(callbackUrl.searchParams.get('error_description'))
    if (oauthError) {
      const errorMessage = oauthErrorDescription || oauthError
      this.mobileAuthSessionStore.markFailedByState(state, errorMessage)
      return {
        ok: false,
        status: 'failed',
        message: errorMessage,
      }
    }

    const authCode = readText(callbackUrl.searchParams.get('code'))
    if (!authCode) {
      const message = 'ChatGPT callback is missing code'
      this.mobileAuthSessionStore.markFailedByState(state, message)
      return {
        ok: false,
        status: 'failed',
        message,
      }
    }

    const relayUrl = buildMobileAuthRelayUrl(session.originalCallbackUrl, callbackUrl)
    let relayResponse: Response
    try {
      relayResponse = await fetch(relayUrl, {
        method: 'GET',
        redirect: 'manual',
      })
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to relay ChatGPT callback to the local host')
      this.mobileAuthSessionStore.markFailedByState(state, message)
      return {
        ok: false,
        status: 'failed',
        message,
      }
    }

    if (!relayResponse.ok && relayResponse.status !== 302 && relayResponse.status !== 303) {
      const message = `Local ChatGPT callback returned HTTP ${String(relayResponse.status)}`
      this.mobileAuthSessionStore.markFailedByState(state, message)
      return {
        ok: false,
        status: 'failed',
        message,
      }
    }

    this.mobileAuthSessionStore.markSuccessByState(state)
    return {
      ok: true,
      status: 'success',
      message: 'ChatGPT login completed. You can return to the account center.',
    }
  }

  private getTranscriptionService() {
    return createTranscriptionService(this.voiceInputFallbackConfig)
  }

  private async handleVoiceInputPrivateRpc(method: string, params: unknown): Promise<unknown> {
    const transcriptionService = this.getTranscriptionService()

    if (method === PRIVATE_VOICE_INPUT_CAPABILITY_METHOD) {
      return transcriptionService.getCapability()
    }

    if (method !== PRIVATE_VOICE_INPUT_TRANSCRIPTION_METHOD) {
      throw new PrivateRpcError(-32602, 'Invalid private RPC method', 400)
    }

    const body = asRecord(params)
    if (!body) {
      throw new PrivateRpcError(-32602, 'Invalid params', 400)
    }

    const audioBase64 = readText(body.audioBase64)
    const contentType = readText(body.contentType)
    const language = readText(body.language) || undefined

    if (!audioBase64 || !contentType) {
      throw new PrivateRpcError(-32602, 'Invalid params', 400)
    }

    let audio: Buffer
    try {
      audio = Buffer.from(audioBase64, 'base64')
    } catch {
      throw new PrivateRpcError(-32602, 'Invalid params', 400)
    }

    if (audio.length === 0) {
      throw new PrivateRpcError(-32013, 'Audio payload is empty', 400)
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new PrivateRpcError(-32012, 'Audio payload too large', 413)
    }
    if (!transcriptionService.getCapability().acceptedMimeTypes.some((value) => value === contentType)) {
      throw new PrivateRpcError(-32011, 'Unsupported audio content type', 415)
    }

    try {
      const text = await transcriptionService.transcribeAudio({
        audio,
        contentType,
        language,
      })
      return {
        text,
        provider: transcriptionService.getCapability().provider,
        model: transcriptionService.getCapability().model,
      }
    } catch (error) {
      if (error instanceof TranscriptionServiceError) {
        const activeProvider = this.voiceInputFallbackConfig.provider === 'zhipu' ? 'zhipu' : 'openai'
        if (error.status === 503) {
          throw new PrivateRpcError(-32010, error.message, 503)
        }
        if (error.status === 415) {
          throw new PrivateRpcError(-32011, error.message, 415)
        }
        if (error.status === 413) {
          throw new PrivateRpcError(-32012, error.message, 413)
        }
        if (error.status === 400) {
          throw new PrivateRpcError(-32013, error.message, 400)
        }
        const normalizedMessage = error.message.toLowerCase()
        if (
          normalizedMessage.includes('insufficient_quota')
          || normalizedMessage.includes('quota exceeded')
          || normalizedMessage.includes('余额不足')
          || normalizedMessage.includes('quota')
          || normalizedMessage.includes('balance')
          || (activeProvider === 'zhipu' && normalizedMessage.includes('资源包'))
        ) {
          throw new PrivateRpcError(-32017, 'Voice transcription quota exceeded', 402)
        }
        if (error.status === 429) {
          throw new PrivateRpcError(-32015, 'Transcription upstream rate limited', 429)
        }
        if (normalizedMessage.includes('did not include text')) {
          throw new PrivateRpcError(-32016, 'Transcription upstream returned no text', 502)
        }
        throw new PrivateRpcError(-32014, 'Transcription upstream request failed', 502)
      }
      throw error
    }
  }

  private async handleBrowserOpenPrivateRpc(params: unknown): Promise<unknown> {
    const body = asRecord(params)
    const rawUrl = readText(body?.url)
    if (!rawUrl) {
      throw new PrivateRpcError(-32602, 'Invalid params', 400)
    }

    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      throw new PrivateRpcError(-32602, 'Invalid URL', 400)
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new PrivateRpcError(-32602, 'Only http(s) URLs are supported', 400)
    }

    try {
      await openUrlInHostBrowser(parsed.toString())
      return { opened: true }
    } catch (error) {
      throw new PrivateRpcError(
        -32020,
        getErrorMessage(error, 'Failed to open URL in host browser'),
        500,
      )
    }
  }

  private async handlePrivateRpc(method: string, params: unknown): Promise<unknown> {
    if (method === PRIVATE_VOICE_INPUT_CAPABILITY_METHOD || method === PRIVATE_VOICE_INPUT_TRANSCRIPTION_METHOD) {
      return this.handleVoiceInputPrivateRpc(method, params)
    }

    if (method === PRIVATE_BROWSER_OPEN_METHOD) {
      return this.handleBrowserOpenPrivateRpc(params)
    }

    return PRIVATE_RPC_NOT_HANDLED
  }

  private start(): void {
    if (this.process) return

    this.stopping = false
    const proc = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.process = proc

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      this.readBuffer += chunk

      let lineEnd = this.readBuffer.indexOf('\n')
      while (lineEnd !== -1) {
        const line = this.readBuffer.slice(0, lineEnd).trim()
        this.readBuffer = this.readBuffer.slice(lineEnd + 1)

        if (line.length > 0) {
          this.handleLine(line)
        }

        lineEnd = this.readBuffer.indexOf('\n')
      }
    })

    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', () => {
      // Keep stderr silent in dev middleware; JSON-RPC errors are forwarded via responses.
    })

    proc.on('exit', () => {
      const failure = new Error(this.stopping ? 'codex app-server stopped' : 'codex app-server exited unexpectedly')
      for (const request of this.pending.values()) {
        request.reject(failure)
      }

      this.pending.clear()
      this.pendingServerRequests.clear()
      this.process = null
      this.initialized = false
      this.readBuffer = ''
    })
  }

  private sendLine(payload: Record<string, unknown>): void {
    if (!this.process) {
      throw new Error('codex app-server is not running')
    }

    this.process.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse
    try {
      message = JSON.parse(line) as JsonRpcResponse
    } catch {
      return
    }

    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pendingRequest = this.pending.get(message.id)
      this.pending.delete(message.id)

      if (!pendingRequest) return

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message))
      } else {
        pendingRequest.resolve(message.result)
      }
      return
    }

    if (typeof message.method === 'string' && typeof message.id !== 'number') {
      if (SHARED_SESSION_NOTIFICATION_TRIGGER_METHODS.has(message.method)) {
        this.triggerSharedSessionSnapshotSync(readNotificationThreadId(message.params ?? null))
      }
      this.emitNotification({
        method: message.method,
        params: message.params ?? null,
      })
      return
    }

    // Handle server-initiated JSON-RPC requests (approvals, dynamic tool calls, etc.).
    if (typeof message.id === 'number' && typeof message.method === 'string') {
      this.handleServerRequest(message.id, message.method, message.params ?? null)
    }
  }

  private emitNotification(notification: { method: string; params: unknown }): void {
    for (const listener of this.notificationListeners) {
      listener(notification)
    }
  }

  private sendServerRequestReply(requestId: number, reply: ServerRequestReply): void {
    if (reply.error) {
      this.sendLine({
        jsonrpc: '2.0',
        id: requestId,
        error: reply.error,
      })
      return
    }

    this.sendLine({
      jsonrpc: '2.0',
      id: requestId,
      result: reply.result ?? {},
    })
  }

  private async ensurePersistedServerRequestsLoaded(): Promise<void> {
    if (this.persistedServerRequestsLoaded) {
      await this.persistedServerRequestsLoaded
      return
    }

    this.persistedServerRequestsLoaded = (async () => {
      try {
        const raw = await readFile(this.persistedServerRequestsLedgerPath, 'utf8')
        const payload = JSON.parse(raw) as { requests?: unknown[] } | null
        const rows = Array.isArray(payload?.requests) ? payload.requests : []
        this.persistedServerRequests.clear()
        for (const row of rows) {
          const record = asRecord(row)
          const id = record?.id
          const method = typeof record?.method === 'string' ? record.method : ''
          const receivedAtIso = typeof record?.receivedAtIso === 'string' ? record.receivedAtIso : ''
          if (typeof id !== 'number' || !Number.isInteger(id) || !method || !receivedAtIso) continue
          this.persistedServerRequests.set(id, {
            id,
            method,
            threadId: typeof record?.threadId === 'string' ? record.threadId : '',
            turnId: typeof record?.turnId === 'string' ? record.turnId : '',
            itemId: typeof record?.itemId === 'string' ? record.itemId : '',
            cwd: typeof record?.cwd === 'string' ? record.cwd : '',
            params: record?.params ?? null,
            receivedAtIso,
            resolvedAtIso: typeof record?.resolvedAtIso === 'string' ? record.resolvedAtIso : null,
            resolutionKind: typeof record?.resolutionKind === 'string' ? record.resolutionKind : null,
            dismissedAtIso: typeof record?.dismissedAtIso === 'string' ? record.dismissedAtIso : null,
            dismissedReason: typeof record?.dismissedReason === 'string' ? record.dismissedReason : null,
            dismissedBy: record?.dismissedBy === 'user' ? 'user' : null,
          })
        }
        if (this.prunePersistedServerRequests()) {
          this.queuePersistedServerRequestsFlush()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : ''
        if (!message.includes('enoent')) {
          console.warn('[codex-web-local] Failed to load persisted server requests:', error)
        }
      }
    })()

    await this.persistedServerRequestsLoaded
  }

  private prunePersistedServerRequests(nowMs = Date.now()): boolean {
    let changed = false
    for (const [requestId, request] of this.persistedServerRequests.entries()) {
      const resolvedAtMs = parseTimestampMs(request.resolvedAtIso)
      if (resolvedAtMs !== null) {
        if (nowMs - resolvedAtMs > PERSISTED_SERVER_REQUEST_RESOLVED_RETENTION_MS) {
          this.persistedServerRequests.delete(requestId)
          changed = true
        }
        continue
      }
      const receivedAtMs = parseTimestampMs(request.receivedAtIso)
      if (receivedAtMs !== null && nowMs - receivedAtMs > PERSISTED_SERVER_REQUEST_UNRESOLVED_TTL_MS) {
        this.persistedServerRequests.delete(requestId)
        changed = true
      }
    }
    return changed
  }

  private queuePersistedServerRequestsFlush(): void {
    this.persistedServerRequestsFlushChain = this.persistedServerRequestsFlushChain
      .catch(() => {})
      .then(async () => {
        this.prunePersistedServerRequests()
        const ledgerPath = this.persistedServerRequestsLedgerPath
        await mkdir(dirname(ledgerPath), { recursive: true })
        const payload = {
          version: 1,
          requests: Array.from(this.persistedServerRequests.values()).sort((first, second) =>
            first.receivedAtIso.localeCompare(second.receivedAtIso),
          ),
        }
        await writeFile(ledgerPath, JSON.stringify(payload, null, 2), 'utf8')
      })
      .catch((error) => {
        console.warn('[codex-web-local] Failed to persist server requests:', error)
      })
  }

  private async upsertPersistedServerRequest(record: PersistedServerRequest): Promise<void> {
    await this.ensurePersistedServerRequestsLoaded()
    const current = this.persistedServerRequests.get(record.id)
    this.persistedServerRequests.set(record.id, current
      ? {
          ...record,
          resolvedAtIso: current.resolvedAtIso,
          resolutionKind: current.resolutionKind,
          dismissedAtIso: current.dismissedAtIso,
          dismissedReason: current.dismissedReason,
          dismissedBy: current.dismissedBy,
        }
      : record)
    this.queuePersistedServerRequestsFlush()
  }

  private async markPersistedServerRequestResolved(requestId: number, resolutionKind: string): Promise<void> {
    await this.ensurePersistedServerRequestsLoaded()
    const current = this.persistedServerRequests.get(requestId)
    if (!current) return
    this.persistedServerRequests.set(requestId, {
      ...current,
      resolvedAtIso: new Date().toISOString(),
      resolutionKind,
    })
    this.queuePersistedServerRequestsFlush()
  }

  private async resolveThreadCwd(threadId: string): Promise<string | null> {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return null

    const cached = this.threadCwdById.get(normalizedThreadId)
    if (cached) return cached

    try {
      const payload = asRecord(await this.rpc('thread/read', {
        threadId: normalizedThreadId,
        includeTurns: false,
      }))
      const thread = asRecord(payload?.thread)
      const cwd = typeof thread?.cwd === 'string' ? thread.cwd.trim() : ''
      if (!cwd) return null
      const normalizedCwd = resolve(cwd)
      this.threadCwdById.set(normalizedThreadId, normalizedCwd)
      return normalizedCwd
    } catch {
      return null
    }
  }

  private async resolveThreadSessionPath(threadId: string): Promise<string | null> {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return null

    const cached = this.threadPathById.get(normalizedThreadId)
    if (cached) return cached

    try {
      const payload = asRecord(await this.rpc('thread/read', {
        threadId: normalizedThreadId,
        includeTurns: false,
      }))
      const thread = asRecord(payload?.thread)
      const sessionPath = typeof thread?.path === 'string' ? thread.path.trim() : ''
      if (!sessionPath) return null
      this.threadPathById.set(normalizedThreadId, sessionPath)
      return sessionPath
    } catch {
      return null
    }
  }

  async readThreadFileChangesFallback(threadId: string): Promise<unknown | null> {
    const sessionPath = await this.resolveThreadSessionPath(threadId)
    if (!sessionPath) return null

    try {
      return await readThreadFileChangesFallbackFromSessionPath(sessionPath)
    } catch {
      return null
    }
  }

  async readThreadFileChangesTimeline(threadId: string): Promise<unknown | null> {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return null

    let threadReadTimeline: ReturnType<typeof normalizeThreadFileChangeTimelineV2> | null = null
    try {
      const payload = await this.rpc('thread/read', {
        threadId: normalizedThreadId,
        includeTurns: true,
      }) as ThreadReadResponse
      threadReadTimeline = normalizeThreadFileChangeTimelineV2(payload)
    } catch {
      threadReadTimeline = null
    }

    const sessionPath = await this.resolveThreadSessionPath(normalizedThreadId)
    let fallbackTimeline = null as Awaited<ReturnType<typeof readThreadFileChangesTimelineFromSessionPath>> | null
    if (sessionPath) {
      try {
        fallbackTimeline = await readThreadFileChangesTimelineFromSessionPath(sessionPath)
      } catch {
        fallbackTimeline = null
      }
    }

    const mergedTimeline = threadReadTimeline
      ? mergeThreadFileChangeTimelines(threadReadTimeline, {
        threadId: normalizedThreadId,
        records: fallbackTimeline ?? [],
        latestReversibleTurnId: null,
      })
      : (fallbackTimeline
        ? {
          threadId: normalizedThreadId,
          records: fallbackTimeline,
          latestReversibleTurnId: null,
        }
        : null)

    if (!mergedTimeline || mergedTimeline.records.length === 0) return null

    let latestReversible = null as typeof mergedTimeline.records[number] | null
    for (let index = mergedTimeline.records.length - 1; index >= 0; index -= 1) {
      const candidate = mergedTimeline.records[index]
      if (candidate.files.some((file) => file.diff.trim().length > 0)) {
        latestReversible = candidate
        break
      }
    }

    return {
      ...mergedTimeline,
      latestReversibleTurnId: latestReversible?.turnId ?? null,
      records: mergedTimeline.records.map((record) => ({
        ...record,
        canUndo: latestReversible?.turnId === record.turnId && this.latestThreadFileChangeStateByThreadId.get(normalizedThreadId) !== 'reverted',
        canReapply: latestReversible?.turnId === record.turnId && this.latestThreadFileChangeStateByThreadId.get(normalizedThreadId) === 'reverted',
      })),
    }
  }

  async readLatestReversibleThreadFileChange(threadId: string): Promise<unknown | null> {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return null
    const timeline = await this.readThreadFileChangesTimeline(normalizedThreadId)
    const timelineRecord = asRecord(timeline)
    const records = Array.isArray(timelineRecord?.records) ? timelineRecord.records : []
    const latestTurnId = readText(timelineRecord?.latestReversibleTurnId)
    if (!latestTurnId) return null
    const latest = records.find((record) => readText(asRecord(record)?.turnId) === latestTurnId)
    return latest ?? null
  }

  async applyLatestReversibleThreadFileChange(threadId: string, mode: 'undo' | 'reapply'): Promise<{
    threadId: string
    turnId: string
    state: 'applied' | 'reverted'
  }> {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) {
      throw new Error('Missing threadId')
    }
    const cwd = await this.resolveThreadCwd(normalizedThreadId)
    if (!cwd) {
      throw new Error('Failed to resolve thread workspace')
    }
    const guard = await this.getWorkspaceGuard(cwd)
    if (guard.blockedReasons.length > 0) {
      throw new ThreadFileChangeActionError(
        'workspace_not_clean',
        `Workspace is blocked: ${guard.blockedReasons.join(', ')}`,
        409,
      )
    }
    const latest = await this.readLatestReversibleThreadFileChange(normalizedThreadId)
    const latestRecord = asRecord(latest)
    const turnId = readText(latestRecord?.turnId)
    const files = Array.isArray(latestRecord?.files) ? latestRecord.files : []
    const patchText = files
      .map((file) => readText(asRecord(file)?.diff))
      .filter((value) => value.length > 0)
      .join('\n')
      .trim()
    if (!turnId || !patchText) {
      throw new ThreadFileChangeActionError(
        'no_reversible_turn',
        'No reversible file change for thread',
        404,
      )
    }

    try {
      if (mode === 'undo') {
        await runGitWithInput(['apply', '-R', '-'], cwd, `${patchText}\n`)
        this.latestThreadFileChangeStateByThreadId.set(normalizedThreadId, 'reverted')
        return { threadId: normalizedThreadId, turnId, state: 'reverted' }
      }

      await runGitWithInput(['apply', '-'], cwd, `${patchText}\n`)
      this.latestThreadFileChangeStateByThreadId.set(normalizedThreadId, 'applied')
      return { threadId: normalizedThreadId, turnId, state: 'applied' }
    } catch (error) {
      throw new ThreadFileChangeActionError(
        'patch_conflict',
        getErrorMessage(error, 'Failed to apply thread file change patch'),
        409,
      )
    }
  }

  private async resolveRequestWorkspace(params: unknown, fallbackThreadId = ''): Promise<ResolvedRequestWorkspace> {
    const requestParams = asRecord(params)
    const requestCwd = typeof requestParams?.cwd === 'string' ? requestParams.cwd.trim() : ''
    if (requestCwd) {
      return {
        cwd: resolve(requestCwd),
        unresolvedScope: false,
      }
    }

    const threadId =
      typeof requestParams?.threadId === 'string' && requestParams.threadId.trim().length > 0
        ? requestParams.threadId
        : fallbackThreadId
    if (!threadId.trim()) {
      return {
        cwd: '',
        unresolvedScope: false,
      }
    }

    const resolvedCwd = await this.resolveThreadCwd(threadId)
    return {
      cwd: resolvedCwd ?? '',
      unresolvedScope: resolvedCwd === null,
    }
  }

  triggerSharedSessionSnapshotSync(threadId: string): void {
    const normalizedThreadId = readText(threadId)
    if (!normalizedThreadId) return

    try {
      void this.syncSharedSessionSnapshot(normalizedThreadId).catch(() => {})
    } catch {
      // Keep shared snapshot refresh failures isolated from the main bridge flow.
    }
  }

  async syncSharedSessionSnapshot(threadId: string): Promise<void> {
    const normalizedThreadId = readText(threadId)
    if (!normalizedThreadId) return

    try {
      await this.ensurePersistedServerRequestsLoaded()
      const existingSnapshot = await readSharedSessionSnapshot(normalizedThreadId)
      const payload = asRecord(await this.rpc('thread/read', {
        threadId: normalizedThreadId,
        includeTurns: true,
      })) as ThreadReadResponse | null
      const thread = asRecord(payload?.thread)
      if (!thread) return

      const title = readThreadTitle(thread)
      const cwd = readText(thread.cwd)
      const messages = normalizeThreadMessagesV2(payload as ThreadReadResponse)
      const inProgress = normalizeThreadInProgressV2(payload as ThreadReadResponse)
      const activeTurnId = readText(normalizeActiveTurnIdV2(payload as ThreadReadResponse))
      const pendingServerRequests = Array.from(this.pendingServerRequests.values())
        .filter((request) => readRequestThreadId(request) === normalizedThreadId)
        .map((request) => toProjectorPendingServerRequest(request))
      const persistedServerRequests = Array.from(this.persistedServerRequests.values()).filter((request) =>
        readText(request.threadId) === normalizedThreadId,
      )

      const snapshot = buildSharedSessionSnapshot({
        sessionId: normalizedThreadId,
        sourceThreadId: normalizedThreadId,
        sourceConversationId: existingSnapshot?.sourceConversationId ?? null,
        title,
        cwd: cwd || null,
        owner: existingSnapshot?.owner === 'terminal' ? 'terminal' : 'web',
        ownerInstanceId: existingSnapshot?.ownerInstanceId ?? null,
        ownerLeaseExpiresAtIso: existingSnapshot?.ownerLeaseExpiresAtIso ?? null,
        messages,
        inProgress,
        activeTurnId: activeTurnId || null,
        pendingServerRequests,
        persistedServerRequests,
        latestErrorMessage: null,
        updatedAtIso: new Date().toISOString(),
      }) as Parameters<typeof writeSharedSessionSnapshot>[0]
      await writeSharedSessionSnapshot(snapshot)
    } catch {
      // Snapshot refresh is best-effort and must never impact the bridge flow.
    }
  }

  private async toPersistedServerRequest(pendingRequest: PendingServerRequest): Promise<PersistedServerRequest> {
    const requestParams = asRecord(pendingRequest.params)
    return {
      id: pendingRequest.id,
      method: pendingRequest.method,
      threadId: pendingRequest.threadId || (typeof requestParams?.threadId === 'string' ? requestParams.threadId : ''),
      turnId: typeof requestParams?.turnId === 'string' ? requestParams.turnId : '',
      itemId: typeof requestParams?.itemId === 'string' ? requestParams.itemId : '',
      cwd: (await this.resolveRequestWorkspace(pendingRequest.params)).cwd,
      params: pendingRequest.params,
      receivedAtIso: pendingRequest.receivedAtIso,
      resolvedAtIso: null,
      resolutionKind: null,
      dismissedAtIso: null,
      dismissedReason: null,
      dismissedBy: null,
    }
  }

  async dismissPersistedServerRequests(requestIds: number[]): Promise<number[]> {
    await this.ensurePersistedServerRequestsLoaded()
    const dismissedRequestIds: number[] = []
    const affectedThreadIds = new Set<string>()
    for (const requestId of requestIds) {
      const current = this.persistedServerRequests.get(requestId)
      if (!current) continue
      if (current.resolvedAtIso !== null || current.dismissedAtIso !== null) continue
      this.persistedServerRequests.set(requestId, {
        ...current,
        dismissedAtIso: new Date().toISOString(),
        dismissedReason: 'user_ignored_branch_block',
        dismissedBy: 'user',
      })
      dismissedRequestIds.push(requestId)
      const threadId = readText(current.threadId)
      if (threadId) {
        affectedThreadIds.add(threadId)
      }
    }
    if (dismissedRequestIds.length > 0) {
      this.queuePersistedServerRequestsFlush()
      for (const threadId of affectedThreadIds) {
        this.triggerSharedSessionSnapshotSync(threadId)
      }
    }
    return dismissedRequestIds
  }

  private resolvePendingServerRequest(requestId: number, reply: ServerRequestReply): void {
    const pendingRequest = this.pendingServerRequests.get(requestId)
    if (!pendingRequest) {
      throw new Error(`No pending server request found for id ${String(requestId)}`)
    }
    this.pendingServerRequests.delete(requestId)
    const threadId = readRequestThreadId(pendingRequest)

    // Ensure the persisted approval ledger is updated even if the initial upsert
    // has not yet completed. We use the available pendingRequest data to
    // create or update the persisted record and mark it as resolved.
    void (async () => {
      await this.ensurePersistedServerRequestsLoaded()
      const existing = this.persistedServerRequests.get(requestId)
      const resolvedAtIso = new Date().toISOString()
      const resolutionKind = reply.error ? ('rejected' as const) : ('resolved' as const)

      if (existing) {
        this.persistedServerRequests.set(requestId, {
          ...existing,
          resolvedAtIso,
          resolutionKind,
          dismissedAtIso: null,
          dismissedReason: null,
          dismissedBy: null,
        })
      } else {
        const persisted = await this.toPersistedServerRequest(pendingRequest)
        const current = this.persistedServerRequests.get(requestId)
        this.persistedServerRequests.set(requestId, {
          ...(current ?? persisted),
          resolvedAtIso,
          resolutionKind,
          dismissedAtIso: null,
          dismissedReason: null,
          dismissedBy: null,
        })
      }

      this.queuePersistedServerRequestsFlush()
      this.triggerSharedSessionSnapshotSync(threadId)
    })()
    this.sendServerRequestReply(requestId, reply)
    this.emitNotification({
      method: 'server/request/resolved',
      params: {
        id: requestId,
        method: pendingRequest.method,
        threadId,
        mode: 'manual',
        resolvedAtIso: new Date().toISOString(),
      },
    })
  }

  private handleServerRequest(requestId: number, method: string, params: unknown): void {
    const threadId = readPendingServerRequestThreadId(params)
    const pendingRequest: PendingServerRequest = {
      id: requestId,
      method,
      params,
      receivedAtIso: new Date().toISOString(),
      threadId,
    }
    this.pendingServerRequests.set(requestId, pendingRequest)
    void (async () => {
      const persisted = await this.toPersistedServerRequest(pendingRequest)
      await this.upsertPersistedServerRequest(persisted)
    })()
    this.triggerSharedSessionSnapshotSync(threadId)

    this.emitNotification({
      method: 'server/request',
      params: pendingRequest,
    })
  }

  private async call(method: string, params: unknown): Promise<unknown> {
    this.start()
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      this.sendLine({
        jsonrpc: '2.0',
        id,
        method,
        params,
      } satisfies JsonRpcCall)
    })
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return

    await this.call('initialize', {
      clientInfo: {
        name: 'codex-web-local',
        version: '0.1.0',
      },
    })

    this.initialized = true
  }

  async rpc(method: string, params: unknown): Promise<unknown> {
    const privateResult = await this.handlePrivateRpc(method, params)
    if (privateResult !== PRIVATE_RPC_NOT_HANDLED) {
      return privateResult
    }

    await this.ensureInitialized()
    return this.call(method, params)
  }

  onNotification(listener: (value: { method: string; params: unknown }) => void): () => void {
    this.notificationListeners.add(listener)
    return () => {
      this.notificationListeners.delete(listener)
    }
  }

  async respondToServerRequest(payload: unknown): Promise<void> {
    await this.ensureInitialized()

    const body = asRecord(payload)
    if (!body) {
      throw new Error('Invalid response payload: expected object')
    }

    const id = body.id
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error('Invalid response payload: "id" must be an integer')
    }

    const rawError = asRecord(body.error)
    if (rawError) {
      const message = typeof rawError.message === 'string' && rawError.message.trim().length > 0
        ? rawError.message.trim()
        : 'Server request rejected by client'
      const code = typeof rawError.code === 'number' && Number.isFinite(rawError.code)
        ? Math.trunc(rawError.code)
        : -32000
      this.resolvePendingServerRequest(id, { error: { code, message } })
      return
    }

    if (!('result' in body)) {
      throw new Error('Invalid response payload: expected "result" or "error"')
    }

    this.resolvePendingServerRequest(id, { result: body.result })
  }

  listPendingServerRequests(): PendingServerRequest[] {
    return Array.from(this.pendingServerRequests.values())
  }

  private async listPendingServerRequestsForWorkspace(cwd: string): Promise<{
    requests: PendingServerRequest[]
    hasUnresolvedScope: boolean
  }> {
    const targetCwd = resolve(cwd)
    const requests = await Promise.all(Array.from(this.pendingServerRequests.values()).map(async (request) => {
      const resolvedWorkspace = await this.resolveRequestWorkspace(request.params)
      return { request, resolvedWorkspace }
    }))
    return {
      requests: requests
        .filter((row) => row.resolvedWorkspace.cwd === targetCwd)
        .map((row) => row.request)
        .sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso)),
      hasUnresolvedScope: requests.some((row) => row.resolvedWorkspace.unresolvedScope),
    }
  }

  private async listPersistedServerRequestsForWorkspace(cwd: string): Promise<{
    requests: PersistedServerRequest[]
    hasUnresolvedScope: boolean
  }> {
    const targetCwd = resolve(cwd)
    await this.ensurePersistedServerRequestsLoaded()
    if (this.prunePersistedServerRequests()) {
      this.queuePersistedServerRequestsFlush()
    }
    let shouldFlush = false
    const requests = await Promise.all(Array.from(this.persistedServerRequests.values()).map(async (request) => {
      if (request.resolvedAtIso !== null || request.dismissedAtIso !== null) return null
      const resolvedWorkspace = await this.resolveRequestWorkspace(request.params, request.threadId)
      if (!request.cwd && resolvedWorkspace.cwd) {
        this.persistedServerRequests.set(request.id, {
          ...request,
          cwd: resolvedWorkspace.cwd,
        })
        shouldFlush = true
      }
      return {
        request,
        resolvedWorkspace: {
          cwd: request.cwd.trim() ? resolve(request.cwd) : resolvedWorkspace.cwd,
          unresolvedScope: resolvedWorkspace.unresolvedScope,
        },
      }
    }))
    if (shouldFlush) {
      this.queuePersistedServerRequestsFlush()
    }
    return {
      requests: requests
        .filter((row): row is { request: PersistedServerRequest; resolvedWorkspace: ResolvedRequestWorkspace } => row !== null)
        .filter((row) => row.resolvedWorkspace.cwd === targetCwd)
        .map((row) => row.request)
        .sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso)),
      hasUnresolvedScope: requests.some((row) => row?.resolvedWorkspace.unresolvedScope === true),
    }
  }

  async getWorkspaceGuard(cwd: string): Promise<ServerSideWorkspaceGuard> {
    const status = await readWorkspaceGitStatus(cwd)
    if (!status.isRepo) {
      return {
        cwd: status.cwd,
        isRepo: false,
        blockedReasons: ['not_repo'],
      }
    }

    const blockedReasons: ServerSideWorkspaceGuardBlockedReason[] = []
    if (status.isDirty) {
      blockedReasons.push('workspace_dirty')
    }
    const pendingRequests = await this.listPendingServerRequestsForWorkspace(status.cwd)
    if (pendingRequests.requests.length > 0) {
      blockedReasons.push('pending_server_requests')
    }
    const persistedRequests = await this.listPersistedServerRequestsForWorkspace(status.cwd)
    if (persistedRequests.requests.length > 0) {
      blockedReasons.push('persisted_server_requests')
    }
    if (pendingRequests.hasUnresolvedScope || persistedRequests.hasUnresolvedScope) {
      blockedReasons.push('unresolved_server_request_scope')
    }

    return {
      cwd: status.cwd,
      isRepo: true,
      blockedReasons,
    }
  }

  async listPersistedServerRequests(): Promise<PersistedServerRequest[]> {
    await this.ensurePersistedServerRequestsLoaded()
    if (this.prunePersistedServerRequests()) {
      this.queuePersistedServerRequestsFlush()
    }
    return Array.from(this.persistedServerRequests.values())
      .filter((request) => request.resolvedAtIso === null && request.dismissedAtIso === null)
      .sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
  }

  dispose(): void {
    if (!this.process) return

    const proc = this.process
    this.stopping = true
    this.process = null
    this.initialized = false
    this.readBuffer = ''

    const failure = new Error('codex app-server stopped')
    for (const request of this.pending.values()) {
      request.reject(failure)
    }
    this.pending.clear()
    this.pendingServerRequests.clear()

    try {
      proc.stdin.end()
    } catch {
      // ignore close errors on shutdown
    }

    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore kill errors on shutdown
    }

    const forceKillTimer = setTimeout(() => {
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL')
        } catch {
          // ignore kill errors on shutdown
        }
      }
    }, 1500)
    forceKillTimer.unref()
  }
}

class MethodCatalog {
  private methodCache: string[] | null = null
  private notificationCache: string[] | null = null

  private async runGenerateSchemaCommand(outDir: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const process = spawn('codex', ['app-server', 'generate-json-schema', '--out', outDir], {
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      let stderr = ''

      process.stderr.setEncoding('utf8')
      process.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })

      process.on('error', reject)
      process.on('exit', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(stderr.trim() || `generate-json-schema exited with code ${String(code)}`))
      })
    })
  }

  private extractMethodsFromClientRequest(payload: unknown): string[] {
    const root = asRecord(payload)
    const oneOf = Array.isArray(root?.oneOf) ? root.oneOf : []
    const methods = new Set<string>()

    for (const entry of oneOf) {
      const row = asRecord(entry)
      const properties = asRecord(row?.properties)
      const methodDef = asRecord(properties?.method)
      const methodEnum = Array.isArray(methodDef?.enum) ? methodDef.enum : []

      for (const item of methodEnum) {
        if (typeof item === 'string' && item.length > 0) {
          methods.add(item)
        }
      }
    }

    return Array.from(methods).sort((a, b) => a.localeCompare(b))
  }

  private extractMethodsFromServerNotification(payload: unknown): string[] {
    const root = asRecord(payload)
    const oneOf = Array.isArray(root?.oneOf) ? root.oneOf : []
    const methods = new Set<string>()

    for (const entry of oneOf) {
      const row = asRecord(entry)
      const properties = asRecord(row?.properties)
      const methodDef = asRecord(properties?.method)
      const methodEnum = Array.isArray(methodDef?.enum) ? methodDef.enum : []

      for (const item of methodEnum) {
        if (typeof item === 'string' && item.length > 0) {
          methods.add(item)
        }
      }
    }

    return Array.from(methods).sort((a, b) => a.localeCompare(b))
  }

  async listMethods(): Promise<string[]> {
    if (this.methodCache) {
      return this.methodCache
    }

    const outDir = await mkdtemp(join(tmpdir(), 'codex-web-local-schema-'))
    await this.runGenerateSchemaCommand(outDir)

    const clientRequestPath = join(outDir, 'ClientRequest.json')
    const raw = await readFile(clientRequestPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const methods = Array.from(new Set([
      ...this.extractMethodsFromClientRequest(parsed),
      ...PRIVATE_RPC_METHODS,
    ])).sort((a, b) => a.localeCompare(b))

    this.methodCache = methods
    return methods
  }

  async listNotificationMethods(): Promise<string[]> {
    if (this.notificationCache) {
      return this.notificationCache
    }

    const outDir = await mkdtemp(join(tmpdir(), 'codex-web-local-schema-'))
    await this.runGenerateSchemaCommand(outDir)

    const serverNotificationPath = join(outDir, 'ServerNotification.json')
    const raw = await readFile(serverNotificationPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const methods = this.extractMethodsFromServerNotification(parsed)

    this.notificationCache = methods
    return methods
  }
}

type CodexBridgeMiddleware = ((req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>) & {
  dispose: () => void
}

type SharedBridgeState = {
  appServer: AppServerProcess
  methodCatalog: MethodCatalog
}

const PRIVATE_RPC_NOT_HANDLED = Symbol('PRIVATE_RPC_NOT_HANDLED')

const SHARED_BRIDGE_KEY = '__codexRemoteSharedBridge__'

function getSharedBridgeState(): SharedBridgeState {
  const globalScope = globalThis as typeof globalThis & {
    [SHARED_BRIDGE_KEY]?: SharedBridgeState
  }

  const existing = globalScope[SHARED_BRIDGE_KEY]
  if (existing) return existing

  const created: SharedBridgeState = {
    appServer: new AppServerProcess(),
    methodCatalog: new MethodCatalog(),
  }
  globalScope[SHARED_BRIDGE_KEY] = created
  return created
}

export function createCodexBridgeMiddleware(options: { voiceInputFallback?: VoiceInputFallbackConfig; publicBaseUrl?: string | null } = {}): CodexBridgeMiddleware {
  const { appServer, methodCatalog } = getSharedBridgeState()
  appServer.setVoiceInputFallbackConfig(options.voiceInputFallback ?? {
    provider: 'openai',
    enabled: false,
    model: 'gpt-4o-mini-transcribe',
  })
  if (Object.prototype.hasOwnProperty.call(options, 'publicBaseUrl')) {
    appServer.setPublicBaseUrl(options.publicBaseUrl)
  }

  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    try {
      if (!req.url) {
        next()
        return
      }

      const url = new URL(req.url, 'http://localhost')

      if (req.method === 'POST' && url.pathname === '/codex-api/rpc') {
        const payload = await readJsonBody(req)
        const body = asRecord(payload) as RpcProxyRequest | null

        if (!body || typeof body.method !== 'string' || body.method.length === 0) {
          setJson(res, 400, { error: 'Invalid body: expected { method, params? }' })
          return
        }

        const params = Object.prototype.hasOwnProperty.call(body, 'params')
          ? body.params
          : undefined

        try {
          const rawResult = await appServer.rpc(body.method, params)
          const result = body.method === 'config/read'
            ? appServer.withWebLocalConfigSnapshot(rawResult)
            : rawResult
          appServer.triggerSharedSessionSnapshotSync(readThreadIdFromRpcPayload(body.method, params, result))
          setJson(res, 200, { result })
          return
        } catch (error) {
          if (error instanceof PrivateRpcError) {
            setJson(res, error.statusCode, { error: { code: error.code, message: error.message } })
            return
          }
          throw error
        }
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/server-requests/respond') {
        const payload = await readJsonBody(req)
        await appServer.respondToServerRequest(payload)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/chatgpt/mobile/start') {
        const result = await appServer.startMobileChatgptLogin()
        setJson(res, 200, result)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/auth/chatgpt/mobile/status') {
        const loginSessionId = readText(url.searchParams.get('id'))
        if (!loginSessionId) {
          setJson(res, 400, { error: 'Missing query parameter: id' })
          return
        }
        setJson(res, 200, appServer.getMobileChatgptLoginStatus(loginSessionId))
        return
      }

      if (req.method === 'GET' && url.pathname === '/auth/chatgpt/callback') {
        const result = await appServer.completeMobileChatgptCallback(url)
        setHtml(
          res,
          result.ok ? 200 : 400,
          [
            '<!doctype html>',
            '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
            `<title>${result.ok ? 'ChatGPT login completed' : 'ChatGPT login failed'}</title>`,
            '</head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px;line-height:1.6;">',
            `<h1>${result.ok ? 'ChatGPT login completed' : 'ChatGPT login failed'}</h1>`,
            `<p>${result.message}</p>`,
            '<p>You can return to the Codex account center now.</p>',
            '</body></html>',
          ].join(''),
        )
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/shared-sessions') {
        setJson(res, 200, { data: await listSharedSessionSnapshots() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-file-changes/fallback') {
        const threadId = readText(url.searchParams.get('threadId'))
        if (!threadId) {
          setJson(res, 400, { error: 'Missing query parameter: threadId' })
          return
        }

        setJson(res, 200, { data: await appServer.readThreadFileChangesFallback(threadId) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-file-changes/timeline') {
        const threadId = readText(url.searchParams.get('threadId'))
        if (!threadId) {
          setJson(res, 400, { error: 'Missing query parameter: threadId' })
          return
        }

        setJson(res, 200, { data: await appServer.readThreadFileChangesTimeline(threadId) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-file-changes/latest-reversible') {
        const threadId = readText(url.searchParams.get('threadId'))
        if (!threadId) {
          setJson(res, 400, { error: 'Missing query parameter: threadId' })
          return
        }
        const latest = await appServer.readLatestReversibleThreadFileChange(threadId)
        if (!latest) {
          setThreadFileChangeActionError(res, new ThreadFileChangeActionError(
            'no_reversible_turn',
            `No reversible file change found for thread ${threadId}`,
            404,
          ))
          return
        }
        setJson(res, 200, { data: latest })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-file-changes/undo-latest') {
        const payload = asRecord(await readJsonBody(req))
        const threadId = readText(payload?.threadId)
        if (!threadId) {
          setJson(res, 400, { error: 'Missing body field: threadId' })
          return
        }
        try {
          setJson(res, 200, { data: await appServer.applyLatestReversibleThreadFileChange(threadId, 'undo') })
        } catch (error) {
          if (isThreadFileChangeActionError(error)) {
            setThreadFileChangeActionError(res, error)
            return
          }
          throw error
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-file-changes/reapply-latest') {
        const payload = asRecord(await readJsonBody(req))
        const threadId = readText(payload?.threadId)
        if (!threadId) {
          setJson(res, 400, { error: 'Missing body field: threadId' })
          return
        }
        try {
          setJson(res, 200, { data: await appServer.applyLatestReversibleThreadFileChange(threadId, 'reapply') })
        } catch (error) {
          if (isThreadFileChangeActionError(error)) {
            setThreadFileChangeActionError(res, error)
            return
          }
          throw error
        }
        return
      }

      const sharedSessionPrefix = '/codex-api/shared-sessions/'
      if (req.method === 'GET' && url.pathname.startsWith(sharedSessionPrefix)) {
        const sessionId = decodeURIComponent(url.pathname.slice(sharedSessionPrefix.length)).trim()
        if (!sessionId) {
          setJson(res, 400, { error: 'Missing path parameter: sessionId' })
          return
        }

        setJson(res, 200, { data: await readSharedSessionSnapshot(sessionId) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/server-requests/pending') {
        setJson(res, 200, { data: appServer.listPendingServerRequests() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/server-requests/persisted') {
        setJson(res, 200, { data: await appServer.listPersistedServerRequests() })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/server-requests/persisted/dismiss') {
        const payload = await readJsonBody(req)
        const body = asRecord(payload)
        const requestIds = Array.isArray(body?.requestIds)
          ? body.requestIds.filter((value): value is number => typeof value === 'number' && Number.isInteger(value))
          : []
        setJson(res, 200, { data: await appServer.dismissPersistedServerRequests(requestIds) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/meta/methods') {
        const methods = await methodCatalog.listMethods()
        setJson(res, 200, { data: methods })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/meta/notifications') {
        const methods = await methodCatalog.listNotificationMethods()
        setJson(res, 200, { data: methods })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/file-preview') {
        const rawPath = url.searchParams.get('path') ?? ''
        const filePath = normalizePreviewPath(rawPath)
        if (!filePath) {
          setJson(res, 400, { error: 'Missing query parameter: path' })
          return
        }

        try {
          const fileStat = await stat(filePath)
          if (!fileStat.isFile()) {
            setJson(res, 400, { error: 'Target path is not a file' })
            return
          }
          if (fileStat.size > 1024 * 1024) {
            setJson(res, 413, { error: 'File too large (>1MB) for preview' })
            return
          }

          const rawLine = url.searchParams.get('line') ?? ''
          const parsedLine = Number.parseInt(rawLine, 10)
          const line = Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null
          const content = await readFile(filePath, 'utf8')
          setJson(res, 200, { path: filePath, line, content })
          return
        } catch (error) {
          const message = getErrorMessage(error, 'Failed to read file')
          const statusCode = message.includes('ENOENT') ? 404 : 400
          setJson(res, statusCode, { error: message })
          return
        }
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/workspace-changes') {
        const cwd = url.searchParams.get('cwd') ?? ''
        if (!cwd.trim()) {
          setJson(res, 400, { error: 'Missing query parameter: cwd' })
          return
        }

        try {
          const files = await collectWorkspaceChanges(cwd)
          const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0)
          const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0)
          setJson(res, 200, {
            files,
            totalAdditions,
            totalDeletions,
          })
          return
        } catch (error) {
          const message = getErrorMessage(error, 'Failed to collect workspace changes')
          setJson(res, 200, {
            files: [],
            totalAdditions: 0,
            totalDeletions: 0,
            warning: message,
          })
          return
        }
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/workspace-diff') {
        const cwd = url.searchParams.get('cwd') ?? ''
        if (!cwd.trim()) {
          setJson(res, 400, { error: 'Missing query parameter: cwd' })
          return
        }
        try {
          const diff = await collectWorkspaceUnifiedDiff(cwd)
          setJson(res, 200, { diff })
          return
        } catch (error) {
          const message = getErrorMessage(error, 'Failed to collect workspace diff')
          setJson(res, 200, { diff: '', warning: message })
          return
        }
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/workspace-diff-mode') {
        const cwd = url.searchParams.get('cwd') ?? ''
        const mode = normalizeWorkspaceDiffMode(url.searchParams.get('mode') ?? '')
        const baseBranch = url.searchParams.get('baseBranch')
        if (!cwd.trim()) {
          setJson(res, 400, { error: 'Missing query parameter: cwd' })
          return
        }
        if (!mode) {
          setJson(res, 400, { error: 'Invalid query parameter: mode' })
          return
        }
        try {
          const snapshot = await collectWorkspaceDiffSnapshot(cwd, mode, { baseBranch })
          setJson(res, 200, snapshot)
          return
        } catch (error) {
          const message = getErrorMessage(error, 'Failed to collect workspace diff mode')
          setJson(res, 200, {
            mode,
            cwd: resolve(cwd),
            label: '',
            baseRef: null,
            targetRef: null,
            warning: message,
            files: [],
            totalAdditions: 0,
            totalDeletions: 0,
          } satisfies WorkspaceDiffSnapshot)
          return
        }
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/git/status') {
        const cwd = url.searchParams.get('cwd') ?? ''
        if (!cwd.trim()) {
          setJson(res, 400, { error: 'Missing query parameter: cwd' })
          return
        }

        const status = await readWorkspaceGitStatus(cwd)
        setJson(res, 200, status)
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/git/branches') {
        const cwd = url.searchParams.get('cwd') ?? ''
        if (!cwd.trim()) {
          setJson(res, 400, { error: 'Missing query parameter: cwd' })
          return
        }

        const branches = await readWorkspaceBranches(cwd)
        setJson(res, 200, branches)
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/git/push/status') {
        const cwd = url.searchParams.get('cwd') ?? ''
        if (!cwd.trim()) {
          setJson(res, 400, { error: 'Missing query parameter: cwd' })
          return
        }

        const status = await readWorkspacePushStatus(cwd)
        setJson(res, 200, status)
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/git/push') {
        const payload = await readJsonBody(req)
        const body = asRecord(payload)
        const cwd = typeof body?.cwd === 'string' ? body.cwd : ''
        if (!cwd.trim()) {
          setJson(res, 400, { error: 'Missing body field: cwd' })
          return
        }

        try {
          const guard = await appServer.getWorkspaceGuard(cwd)
          if (guard.blockedReasons.length > 0) {
            setJson(res, 409, {
              error: 'Workspace push is blocked by current workspace state',
              blockedReasons: guard.blockedReasons,
            })
            return
          }

          const metadata = await resolveWorkspacePushMetadata(cwd)
          if (!metadata.currentBranch) {
            setJson(res, 400, {
              error: 'Current HEAD is detached; cannot push',
            })
            return
          }

          const result = await pushWorkspaceBranch(cwd)
          setJson(res, 200, {
            ok: true,
            ...result,
          })
        } catch (error) {
          setJson(res, 400, { error: getErrorMessage(error, 'Failed to push branch') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/git/branch/switch') {
        const payload = await readJsonBody(req)
        const body = asRecord(payload)
        const cwd = typeof body?.cwd === 'string' ? body.cwd : ''
        const branch = typeof body?.branch === 'string' ? body.branch : ''
        if (!cwd.trim()) {
          setJson(res, 400, { error: 'Missing body field: cwd' })
          return
        }

        try {
          const guard = await appServer.getWorkspaceGuard(cwd)
          if (guard.blockedReasons.length > 0) {
            setJson(res, 409, {
              error: 'Workspace branch action is blocked by current workspace state',
              blockedReasons: guard.blockedReasons,
            })
            return
          }
          await switchWorkspaceBranch(cwd, branch)
          setJson(res, 200, { ok: true })
        } catch (error) {
          setJson(res, 400, { error: getErrorMessage(error, 'Failed to switch branch') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/git/branch/create-and-switch') {
        const payload = await readJsonBody(req)
        const body = asRecord(payload)
        const cwd = typeof body?.cwd === 'string' ? body.cwd : ''
        const branch = typeof body?.branch === 'string' ? body.branch : ''
        if (!cwd.trim()) {
          setJson(res, 400, { error: 'Missing body field: cwd' })
          return
        }

        try {
          const guard = await appServer.getWorkspaceGuard(cwd)
          if (guard.blockedReasons.length > 0) {
            setJson(res, 409, {
              error: 'Workspace branch action is blocked by current workspace state',
              blockedReasons: guard.blockedReasons,
            })
            return
          }
          await createAndSwitchWorkspaceBranch(cwd, branch)
          setJson(res, 200, { ok: true })
        } catch (error) {
          setJson(res, 400, { error: getErrorMessage(error, 'Failed to create branch') })
        }
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/events') {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')

        const unsubscribe = appServer.onNotification((notification) => {
          if (res.writableEnded || res.destroyed) return
          const payload = {
            ...notification,
            atIso: new Date().toISOString(),
          }
          res.write(`data: ${JSON.stringify(payload)}\n\n`)
        })

        res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`)
        const keepAlive = setInterval(() => {
          res.write(': ping\n\n')
        }, 15000)

        const close = () => {
          clearInterval(keepAlive)
          unsubscribe()
          if (!res.writableEnded) {
            res.end()
          }
        }

        req.on('close', close)
        req.on('aborted', close)
        return
      }

      next()
    } catch (error) {
      const message = getErrorMessage(error, 'Unknown bridge error')
      setJson(res, 502, { error: message })
    }
  }

  middleware.dispose = () => {
    appServer.dispose()
  }

  return middleware
}
