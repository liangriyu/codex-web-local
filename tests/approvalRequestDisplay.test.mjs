import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApprovalRequestDisplayModel } from '../src/utils/approvalRequestDisplay.ts'

test('buildApprovalRequestDisplayModel builds command approval cards with execpolicy option when proposal exists', () => {
  const model = buildApprovalRequestDisplayModel({
    id: 7,
    method: 'item/commandExecution/requestApproval',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    receivedAtIso: '2026-04-03T10:00:00.000Z',
    params: {
      command: 'docker compose run --rm goose-cli --version',
      cwd: '/workspace/goose',
      reason: '需要在沙箱外执行该命令',
      commandActions: [
        { type: 'listFiles', path: '/workspace/goose' },
        { type: 'search', query: 'goose', path: '/workspace/goose' },
      ],
      proposedExecpolicyAmendment: ['docker', 'compose', 'run'],
    },
  })

  assert.equal(model?.kind, 'command')
  assert.equal(model?.title, '是否允许执行此命令？')
  assert.equal(model?.command, 'docker compose run --rm goose-cli --version')
  assert.equal(model?.cwd, '/workspace/goose')
  assert.match(model?.reason ?? '', /沙箱外执行/)
  assert.match(model?.summary ?? '', /读取目录|查看目录/)
  assert.match(model?.summary ?? '', /搜索/)
  assert.equal(model?.options.length, 3)
  assert.deepEqual(model?.options[1]?.decision, {
    acceptWithExecpolicyAmendment: {
      execpolicy_amendment: ['docker', 'compose', 'run'],
    },
  })
})

test('buildApprovalRequestDisplayModel falls back to acceptForSession when no execpolicy proposal exists', () => {
  const model = buildApprovalRequestDisplayModel({
    id: 8,
    method: 'item/commandExecution/requestApproval',
    threadId: 'thread-1',
    turnId: 'turn-2',
    itemId: 'item-2',
    receivedAtIso: '2026-04-03T10:01:00.000Z',
    params: {
      command: '',
      cwd: '',
      reason: '需要联网下载依赖',
    },
  })

  assert.equal(model?.kind, 'command')
  assert.equal(model?.command, '未提供命令内容')
  assert.equal(model?.cwd, '未提供执行目录')
  assert.deepEqual(model?.options[1]?.decision, 'acceptForSession')
})

test('buildApprovalRequestDisplayModel uses fileChanges data for file approval cards', () => {
  const model = buildApprovalRequestDisplayModel({
    id: 9,
    method: 'item/fileChange/requestApproval',
    threadId: 'thread-1',
    turnId: 'turn-3',
    itemId: 'item-3',
    receivedAtIso: '2026-04-03T10:02:00.000Z',
    params: {
      reason: '需要写入工作区文件',
      grantRoot: '/workspace/goose',
    },
  }, {
    turnId: 'turn-3',
    totalAdditions: 18,
    totalDeletions: 7,
    files: [
      { path: 'src/components/content/ThreadConversation.vue', additions: 10, deletions: 2, diff: '@@' },
      { path: 'src/i18n/uiText.ts', additions: 6, deletions: 1, diff: '@@' },
      { path: 'src/utils/approvalRequestDisplay.ts', additions: 2, deletions: 4, diff: '@@' },
    ],
  })

  assert.equal(model?.kind, 'fileChange')
  assert.equal(model?.title, '是否允许应用这些文件改动？')
  assert.equal(model?.grantRoot, '/workspace/goose')
  assert.equal(model?.fileCount, 3)
  assert.equal(model?.totalAdditions, 18)
  assert.equal(model?.totalDeletions, 7)
  assert.deepEqual(model?.files.map((file) => file.path), [
    'src/components/content/ThreadConversation.vue',
    'src/i18n/uiText.ts',
    'src/utils/approvalRequestDisplay.ts',
  ])
  assert.deepEqual(model?.options.map((option) => option.decision), [
    'accept',
    'acceptForSession',
    'decline',
  ])
})

test('buildApprovalRequestDisplayModel supports execCommandApproval requests', () => {
  const model = buildApprovalRequestDisplayModel({
    id: 10,
    method: 'execCommandApproval',
    threadId: 'thread-2',
    turnId: 'turn-10',
    itemId: '',
    receivedAtIso: '2026-04-05T10:00:00.000Z',
    params: {
      conversationId: 'thread-2',
      callId: 'exec-call-1',
      command: ['docker', 'compose', 'run', '--rm', 'goose-cli', '--version'],
      cwd: '/workspace/goose',
      reason: '需要在沙箱外执行该命令',
      parsedCmd: [],
    },
  })

  assert.equal(model?.kind, 'command')
  assert.equal(model?.title, '是否允许执行此命令？')
  assert.equal(model?.command, 'docker compose run --rm goose-cli --version')
  assert.equal(model?.cwd, '/workspace/goose')
  assert.match(model?.reason ?? '', /沙箱外执行/)
  assert.deepEqual(model?.options.map((option) => option.decision), [
    'approved',
    'approved_for_session',
    'denied',
  ])
})

test('buildApprovalRequestDisplayModel supports applyPatchApproval requests', () => {
  const model = buildApprovalRequestDisplayModel({
    id: 11,
    method: 'applyPatchApproval',
    threadId: 'thread-3',
    turnId: 'turn-11',
    itemId: '',
    receivedAtIso: '2026-04-05T10:01:00.000Z',
    params: {
      conversationId: 'thread-3',
      callId: 'patch-call-1',
      reason: '需要写入工作区文件',
      grantRoot: '/workspace/goose',
      fileChanges: {
        'src/App.vue': {
          change_type: 'modified',
          unified_diff: '@@',
        },
        'src/utils/approvalRequestDisplay.ts': {
          change_type: 'added',
          unified_diff: '@@',
        },
      },
    },
  })

  assert.equal(model?.kind, 'fileChange')
  assert.equal(model?.title, '是否允许应用这些文件改动？')
  assert.equal(model?.grantRoot, '/workspace/goose')
  assert.equal(model?.fileCount, 2)
  assert.deepEqual(model?.files.map((file) => file.path), [
    'src/App.vue',
    'src/utils/approvalRequestDisplay.ts',
  ])
  assert.deepEqual(model?.options.map((option) => option.decision), [
    'approved',
    'approved_for_session',
    'denied',
  ])
})

test('buildApprovalRequestDisplayModel supports snake_case exec approval payloads', () => {
  const model = buildApprovalRequestDisplayModel({
    id: 12,
    method: 'execCommandApproval',
    threadId: 'thread-4',
    turnId: '',
    itemId: '',
    receivedAtIso: '2026-04-05T10:02:00.000Z',
    params: {
      conversation_id: 'thread-4',
      call_id: 'exec-call-2',
      command: ['docker', 'compose', 'run', '--rm', 'goose-cli', '--version'],
      cwd: '/workspace/goose',
      reason: '需要在沙箱外执行该命令',
      parsed_cmd: [],
      proposed_execpolicy_amendment: ['docker', 'compose', 'run'],
    },
  })

  assert.equal(model?.kind, 'command')
  assert.deepEqual(model?.options[1]?.decision, {
    approved_execpolicy_amendment: {
      proposed_execpolicy_amendment: ['docker', 'compose', 'run'],
    },
  })
})

test('buildApprovalRequestDisplayModel supports snake_case apply patch payloads', () => {
  const model = buildApprovalRequestDisplayModel({
    id: 13,
    method: 'applyPatchApproval',
    threadId: 'thread-5',
    turnId: '',
    itemId: '',
    receivedAtIso: '2026-04-05T10:03:00.000Z',
    params: {
      conversation_id: 'thread-5',
      call_id: 'patch-call-2',
      grant_root: '/workspace/goose',
      reason: '需要写入工作区文件',
      file_changes: {
        'src/App.vue': {
          type: 'update',
          unified_diff: '@@\n+hello\n-world',
        },
      },
    },
  })

  assert.equal(model?.kind, 'fileChange')
  assert.equal(model?.grantRoot, '/workspace/goose')
  assert.equal(model?.fileCount, 1)
  assert.equal(model?.files[0]?.path, 'src/App.vue')
})
