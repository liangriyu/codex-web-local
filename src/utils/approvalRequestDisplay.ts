import type { UiChangedFile, UiServerRequest, UiTurnFileChanges } from '../types/codex'

export type ApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel'
  | 'approved'
  | 'approved_for_session'
  | 'denied'
  | 'abort'
  | { acceptWithExecpolicyAmendment: { execpolicy_amendment: string[] } }
  | { approved_execpolicy_amendment: { proposed_execpolicy_amendment: string[] } }

export type ApprovalOption = {
  id: string
  number: number
  label: string
  description: string
  decision: ApprovalDecision
}

export type CommandApprovalDisplayModel = {
  kind: 'command'
  title: string
  description: string
  command: string
  cwd: string
  reason: string
  summary: string
  options: ApprovalOption[]
  defaultOptionId: string
  cancelDecision: ApprovalDecision
}

export type FileChangeApprovalDisplayModel = {
  kind: 'fileChange'
  title: string
  description: string
  grantRoot: string
  reason: string
  fileCount: number
  totalAdditions: number
  totalDeletions: number
  files: UiChangedFile[]
  options: ApprovalOption[]
  defaultOptionId: string
  cancelDecision: ApprovalDecision
}

export type ApprovalRequestDisplayModel =
  | CommandApprovalDisplayModel
  | FileChangeApprovalDisplayModel

const APPROVAL_REQUEST_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'execCommandApproval',
  'applyPatchApproval',
])

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function readField(record: JsonRecord | null, ...keys: string[]): unknown {
  if (!record) return undefined
  for (const key of keys) {
    if (key in record) return record[key]
  }
  return undefined
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function readOptionalText(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
}

function readCommandActionSummary(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return ''

  const labels = value
    .map((entry) => asRecord(entry))
    .map((action) => {
      switch (action?.type) {
        case 'read':
          return '读取文件'
        case 'listFiles':
          return '查看目录'
        case 'search':
          return '搜索内容'
        default:
          return ''
      }
    })
    .filter((label) => label.length > 0)

  return Array.from(new Set(labels)).join('、')
}

function buildCommandOptions(params: JsonRecord): ApprovalOption[] {
  const proposedExecpolicyAmendment = readStringArray(
    readField(params, 'proposedExecpolicyAmendment', 'proposed_execpolicy_amendment'),
  )

  const secondDecision: ApprovalDecision = proposedExecpolicyAmendment.length > 0
    ? {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: proposedExecpolicyAmendment,
        },
      }
    : 'acceptForSession'

  return [
    {
      id: 'accept',
      number: 1,
      label: '允许本次执行',
      description: '继续当前操作，仅对这一次生效。',
      decision: 'accept',
    },
    {
      id: 'remember',
      number: 2,
      label: '允许本次执行，并对后续同类命令减少重复确认',
      description: proposedExecpolicyAmendment.length > 0
        ? '按当前建议规则授权后，后续匹配命令可减少重复询问。'
        : '在当前会话内记住这次授权，减少重复确认。',
      decision: secondDecision,
    },
    {
      id: 'decline',
      number: 3,
      label: '拒绝，并让 Codex 调整方案',
      description: '拒绝本次执行，让后续方案回到更安全的路径。',
      decision: 'decline',
    },
  ]
}

function buildExecCommandOptions(params: JsonRecord): ApprovalOption[] {
  const proposedExecpolicyAmendment = readStringArray(
    readField(params, 'proposedExecpolicyAmendment', 'proposed_execpolicy_amendment'),
  )

  const secondDecision: ApprovalDecision = proposedExecpolicyAmendment.length > 0
    ? {
        approved_execpolicy_amendment: {
          proposed_execpolicy_amendment: proposedExecpolicyAmendment,
        },
      }
    : 'approved_for_session'

  return [
    {
      id: 'accept',
      number: 1,
      label: '允许本次执行',
      description: '继续当前操作，仅对这一次生效。',
      decision: 'approved',
    },
    {
      id: 'remember',
      number: 2,
      label: '允许本次执行，并对后续同类命令减少重复确认',
      description: proposedExecpolicyAmendment.length > 0
        ? '按当前建议规则授权后，后续匹配命令可减少重复询问。'
        : '在当前会话内记住这次授权，减少重复确认。',
      decision: secondDecision,
    },
    {
      id: 'decline',
      number: 3,
      label: '拒绝，并让 Codex 调整方案',
      description: '拒绝本次执行，让后续方案回到更安全的路径。',
      decision: 'denied',
    },
  ]
}

function buildFileOptions(): ApprovalOption[] {
  return [
    {
      id: 'accept',
      number: 1,
      label: '允许应用本次改动',
      description: '继续当前改动，仅应用这一次的文件写入。',
      decision: 'accept',
    },
    {
      id: 'session',
      number: 2,
      label: '允许本次改动，并在本会话内减少同类确认',
      description: '在当前会话内记住这次授权，减少重复确认。',
      decision: 'acceptForSession',
    },
    {
      id: 'decline',
      number: 3,
      label: '拒绝这次改动',
      description: '拒绝本次文件写入，让 Codex 改用其他方案。',
      decision: 'decline',
    },
  ]
}

function buildApplyPatchOptions(): ApprovalOption[] {
  return [
    {
      id: 'accept',
      number: 1,
      label: '允许应用本次改动',
      description: '继续当前改动，仅应用这一次的文件写入。',
      decision: 'approved',
    },
    {
      id: 'session',
      number: 2,
      label: '允许本次改动，并在本会话内减少同类确认',
      description: '在当前会话内记住这次授权，减少重复确认。',
      decision: 'approved_for_session',
    },
    {
      id: 'decline',
      number: 3,
      label: '拒绝这次改动',
      description: '拒绝本次文件写入，让 Codex 改用其他方案。',
      decision: 'denied',
    },
  ]
}

function stringifyCommand(command: unknown): string {
  if (Array.isArray(command)) {
    const tokens = command.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    if (tokens.length > 0) return tokens.join(' ')
  }
  return readOptionalText(command)
}

function countDiffStat(diff: string): { additions: number; deletions: number } {
  if (!diff) return { additions: 0, deletions: 0 }
  let additions = 0
  let deletions = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }
  return { additions, deletions }
}

function readApplyPatchFiles(params: JsonRecord): UiChangedFile[] {
  const fileChanges = asRecord(readField(params, 'fileChanges', 'file_changes'))
  if (!fileChanges) return []

  return Object.entries(fileChanges).map(([path, value]) => {
    const fileChange = asRecord(value)
    const diff = readOptionalText(fileChange?.unified_diff)
    const stats = countDiffStat(diff)
    return {
      path,
      additions: stats.additions,
      deletions: stats.deletions,
      diff,
    }
  })
}

export function isApprovalRequestMethod(method: string): boolean {
  return APPROVAL_REQUEST_METHODS.has(method)
}

export function buildApprovalRequestDisplayModel(
  request: UiServerRequest,
  fileChanges: UiTurnFileChanges | null = null,
): ApprovalRequestDisplayModel | null {
  const params = asRecord(request.params)
  if (!params) return null

  if (request.method === 'item/commandExecution/requestApproval') {
    const reason = readText(readField(params, 'reason'), '该操作需要你的授权后才能继续。')
    const summary = readCommandActionSummary(readField(params, 'commandActions', 'command_actions'))
    return {
      kind: 'command',
      title: '是否允许执行此命令？',
      description: '该操作需要你的授权后才能继续',
      command: readText(readField(params, 'command'), '未提供命令内容'),
      cwd: readText(readField(params, 'cwd'), '未提供执行目录'),
      reason,
      summary,
      options: buildCommandOptions(params),
      defaultOptionId: 'accept',
      cancelDecision: 'cancel',
    }
  }

  if (request.method === 'item/fileChange/requestApproval') {
    const matchedFileChanges = fileChanges?.turnId === request.turnId ? fileChanges : null
    return {
      kind: 'fileChange',
      title: '是否允许应用这些文件改动？',
      description: '这些改动需要你的确认后才能写入工作区',
      grantRoot: readText(readField(params, 'grantRoot', 'grant_root'), '未限制写入目录'),
      reason: readText(readField(params, 'reason'), '该操作需要写入工作区文件。'),
      fileCount: matchedFileChanges?.files.length ?? 0,
      totalAdditions: matchedFileChanges?.totalAdditions ?? 0,
      totalDeletions: matchedFileChanges?.totalDeletions ?? 0,
      files: matchedFileChanges?.files ?? [],
      options: buildFileOptions(),
      defaultOptionId: 'accept',
      cancelDecision: 'cancel',
    }
  }

  if (request.method === 'execCommandApproval') {
    const reason = readText(readField(params, 'reason'), '该操作需要你的授权后才能继续。')
    return {
      kind: 'command',
      title: '是否允许执行此命令？',
      description: '该操作需要你的授权后才能继续',
      command: readText(stringifyCommand(readField(params, 'command')), '未提供命令内容'),
      cwd: readText(readField(params, 'cwd'), '未提供执行目录'),
      reason,
      summary: readCommandActionSummary(readField(params, 'commandActions', 'command_actions')),
      options: buildExecCommandOptions(params),
      defaultOptionId: 'accept',
      cancelDecision: 'abort',
    }
  }

  if (request.method === 'applyPatchApproval') {
    const patchFiles = readApplyPatchFiles(params)
    const totalAdditions = patchFiles.reduce((sum, file) => sum + file.additions, 0)
    const totalDeletions = patchFiles.reduce((sum, file) => sum + file.deletions, 0)
    return {
      kind: 'fileChange',
      title: '是否允许应用这些文件改动？',
      description: '这些改动需要你的确认后才能写入工作区',
      grantRoot: readText(readField(params, 'grantRoot', 'grant_root'), '未限制写入目录'),
      reason: readText(readField(params, 'reason'), '该操作需要写入工作区文件。'),
      fileCount: patchFiles.length,
      totalAdditions,
      totalDeletions,
      files: patchFiles,
      options: buildApplyPatchOptions(),
      defaultOptionId: 'accept',
      cancelDecision: 'abort',
    }
  }

  return null
}
