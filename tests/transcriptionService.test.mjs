import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createLocalTranscriptionService } from '../src/server/transcriptionService.ts'

test('local transcription service reports unavailable when STT is not configured', async () => {
  const service = createLocalTranscriptionService({})

  await assert.rejects(
    () => service.transcribeAudio(Buffer.from('test'), { mimeType: 'audio/webm' }),
    /not configured/i,
  )
})

test('local transcription service returns transcript after executor writes output file', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'codex-web-local-transcription-'))
  const modelPath = join(workspace, 'ggml-base.bin')
  await writeFile(modelPath, 'model')

  const service = createLocalTranscriptionService({
    command: '/usr/local/bin/whisper-cli',
    model: modelPath,
    execFileImpl: async (_command, args) => {
      const outputIndex = args.indexOf('-of')
      const outputBase = outputIndex >= 0 ? args[outputIndex + 1] : ''
      await writeFile(`${outputBase}.txt`, 'transcribed text\n')
      return { stdout: '', stderr: '' }
    },
  })

  const result = await service.transcribeAudio(Buffer.from('voice'), { mimeType: 'audio/webm', language: 'zh' })

  assert.equal(result.text, 'transcribed text')
  assert.equal(result.engine, 'local')

  await rm(workspace, { recursive: true, force: true })
})

test('local transcription service surfaces executor failures', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'codex-web-local-transcription-error-'))
  const modelPath = join(workspace, 'ggml-base.bin')
  await writeFile(modelPath, 'model')

  const service = createLocalTranscriptionService({
    command: '/usr/local/bin/whisper-cli',
    model: modelPath,
    execFileImpl: async () => {
      throw new Error('engine exploded')
    },
  })

  await assert.rejects(
    () => service.transcribeAudio(Buffer.from('voice'), { mimeType: 'audio/webm' }),
    /engine exploded/i,
  )

  await rm(workspace, { recursive: true, force: true })
})

test('local transcription service maps executor timeout to a stable error', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'codex-web-local-transcription-timeout-'))
  const modelPath = join(workspace, 'ggml-base.bin')
  await writeFile(modelPath, 'model')

  const service = createLocalTranscriptionService({
    command: '/usr/local/bin/whisper-cli',
    model: modelPath,
    execFileImpl: async () => {
      const error = new Error('timed out')
      error.killed = true
      throw error
    },
  })

  await assert.rejects(
    () => service.transcribeAudio(Buffer.from('voice'), { mimeType: 'audio/webm' }),
    /timed out/i,
  )

  await rm(workspace, { recursive: true, force: true })
})

test('http server wires the local transcription route before the codex bridge', async () => {
  const source = await readFile(new URL('../src/server/httpServer.ts', import.meta.url), 'utf8')

  assert.match(source, /app\.post\('\/api\/transcriptions'/)
  assert.match(source, /parseTranscriptionFormData/)
  assert.match(source, /transcriptionService\.transcribeAudio/)
  assert.match(source, /createLocalTranscriptionService/)
})
