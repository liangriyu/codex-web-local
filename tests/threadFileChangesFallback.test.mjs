import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function readFixture(name) {
  return readFile(new URL(`./fixtures/thread-file-changes-fallback/${name}`, import.meta.url), 'utf8')
}

async function loadFallbackParser() {
  return import('../src/server/threadFileChangesFallback.ts')
}

test('extracts the latest file-change summary from apply_patch session jsonl', async () => {
  const { readThreadFileChangesFallbackFromSessionJsonl } = await loadFallbackParser()
  const sessionJsonl = await readFixture('session-apply-patch.jsonl')

  const summary = await readThreadFileChangesFallbackFromSessionJsonl(sessionJsonl)

  assert.ok(summary)
  assert.equal(summary.turnId, 'turn-2')
  assert.equal(summary.files.length, 1)
  assert.equal(summary.files[0].path, 'docs/plans/obsolete.md')
  assert.equal(typeof summary.files[0].diff, 'string')
  assert.equal(typeof summary.totalAdditions, 'number')
  assert.equal(typeof summary.totalDeletions, 'number')
  assert.ok(summary.totalAdditions >= 0)
  assert.ok(summary.totalDeletions >= 0)
})

test('exposes a turn-level timeline instead of only the latest file-change summary', async () => {
  const parser = await loadFallbackParser()

  assert.equal(typeof parser.readThreadFileChangesTimelineFromSessionJsonl, 'function')

  const sessionJsonl = await readFixture('session-apply-patch.jsonl')
  const timeline = await parser.readThreadFileChangesTimelineFromSessionJsonl(sessionJsonl)

  assert.ok(Array.isArray(timeline))
  assert.ok(timeline.length >= 2)
  assert.deepEqual(
    timeline.map((entry) => entry.turnId),
    ['turn-1', 'turn-2'],
  )
  assert.ok(timeline.every((entry) => Array.isArray(entry.files) && entry.files.length > 0))
  assert.ok(timeline.every((entry) => typeof entry.createdAtIso === 'string' && entry.createdAtIso.length > 0))
})

test('orders timeline entries by time even when session jsonl lines arrive out of order', async () => {
  const parser = await loadFallbackParser()
  assert.equal(typeof parser.readThreadFileChangesTimelineFromSessionJsonl, 'function')

  const sessionJsonl = [
    '{"type":"response_item","turnId":"turn-late","createdAt":"2026-04-07T10:01:00.000Z","item":{"type":"custom_tool_call","name":"apply_patch","input":"*** Begin Patch\\n*** Add File: later.ts\\n+later\\n*** End Patch"}}',
    '{"type":"response_item","turnId":"turn-early","timestamp":"2026-04-07T10:00:00.000Z","item":{"type":"custom_tool_call","name":"apply_patch","input":"*** Begin Patch\\n*** Add File: earlier.ts\\n+earlier\\n*** End Patch"}}',
  ].join('\n')

  const timeline = await parser.readThreadFileChangesTimelineFromSessionJsonl(sessionJsonl)

  assert.ok(Array.isArray(timeline))
  assert.deepEqual(
    timeline.map((entry) => entry.turnId),
    ['turn-early', 'turn-late'],
  )
  assert.deepEqual(
    timeline.map((entry) => entry.files[0]?.path),
    ['earlier.ts', 'later.ts'],
  )
})

test('sorts turn-level timeline by createdAtIso even when session lines are out of order', async () => {
  const parser = await loadFallbackParser()
  const sessionJsonl = [
    '{"type":"response_item","turnId":"turn-2","createdAt":"2026-04-05T01:00:02.000Z","item":{"type":"custom_tool_call","name":"apply_patch","arguments":"*** Begin Patch\\n*** Add File: b.txt\\n+later\\n*** End Patch"}}',
    '{"type":"response_item","turnId":"turn-1","createdAt":"2026-04-05T01:00:01.000Z","item":{"type":"custom_tool_call","name":"apply_patch","arguments":"*** Begin Patch\\n*** Add File: a.txt\\n+earlier\\n*** End Patch"}}',
  ].join('\n')

  const timeline = await parser.readThreadFileChangesTimelineFromSessionJsonl(sessionJsonl)

  assert.deepEqual(
    timeline.map((entry) => entry.turnId),
    ['turn-1', 'turn-2'],
  )
})

test('aggregates multiple apply_patch entries from the same turn into one timeline record', async () => {
  const parser = await loadFallbackParser()
  const sessionJsonl = [
    '{"type":"response_item","turnId":"turn-1","createdAt":"2026-04-07T10:00:01.000Z","item":{"type":"custom_tool_call","name":"apply_patch","arguments":"*** Begin Patch\\n*** Update File: src/a.ts\\n@@\\n-old\\n+new\\n*** End Patch"}}',
    '{"type":"response_item","turnId":"turn-1","createdAt":"2026-04-07T10:00:02.000Z","item":{"type":"custom_tool_call","name":"apply_patch","arguments":"*** Begin Patch\\n*** Update File: src/b.ts\\n@@\\n-before\\n+after\\n*** End Patch"}}',
  ].join('\n')

  const timeline = await parser.readThreadFileChangesTimelineFromSessionJsonl(sessionJsonl)

  assert.equal(timeline.length, 1)
  assert.equal(timeline[0]?.turnId, 'turn-1')
  assert.deepEqual(
    timeline[0]?.files.map((file) => file.path),
    ['src/a.ts', 'src/b.ts'],
  )
  assert.match(timeline[0]?.files[0]?.diff ?? '', /@@/)
  assert.match(timeline[0]?.files[1]?.diff ?? '', /@@/)
})

test('returns null when session jsonl has no file-change events', async () => {
  const { readThreadFileChangesFallbackFromSessionJsonl } = await loadFallbackParser()
  const sessionJsonl = await readFixture('session-no-file-change.jsonl')

  const summary = await readThreadFileChangesFallbackFromSessionJsonl(sessionJsonl)

  assert.equal(summary, null)
})

test('ignores malformed or incomplete records without throwing', async () => {
  const { readThreadFileChangesFallbackFromSessionJsonl } = await loadFallbackParser()
  const sessionJsonl = `${await readFixture('session-apply-patch.jsonl')}\n{"type":"response_item","turnId":"turn-3","item":`

  await assert.doesNotReject(async () => {
    const summary = await readThreadFileChangesFallbackFromSessionJsonl(sessionJsonl)
    assert.equal(summary?.turnId, 'turn-2')
  })
})

test('inherits turn id from surrounding task lifecycle records when apply_patch item omits it', async () => {
  const { readThreadFileChangesFallbackFromSessionJsonl } = await loadFallbackParser()
  const sessionJsonl = [
    '{"type":"event_msg","payload":{"type":"task_started","turn_id":"turn-real-1"}}',
    '{"type":"response_item","payload":{"type":"custom_tool_call","name":"apply_patch","input":"*** Begin Patch\\n*** Add File: sample.txt\\n+fallback sample\\n*** End Patch"}}',
  ].join('\n')

  const summary = await readThreadFileChangesFallbackFromSessionJsonl(sessionJsonl)

  assert.ok(summary)
  assert.equal(summary.turnId, 'turn-real-1')
  assert.equal(summary.files[0]?.path, 'sample.txt')
})
