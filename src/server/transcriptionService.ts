import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type LocalTranscriptionConfig = {
  command?: string
  model?: string
  language?: string
  timeoutMs?: number
}

export type LocalTranscriptionResult = {
  text: string
  language: string | null
  durationMs: number
  engine: 'local'
}

export type LocalTranscriptionService = {
  isConfigured: boolean
  transcribeAudio(audio: Buffer, options: { mimeType: string; language?: string }): Promise<LocalTranscriptionResult>
}

type ExecFileResult = {
  stdout: string
  stderr: string
}

type ExecFileLike = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<ExecFileResult>

type CreateLocalTranscriptionServiceOptions = LocalTranscriptionConfig & {
  execFileImpl?: ExecFileLike
}

function buildWhisperArgs(
  modelPath: string,
  inputPath: string,
  outputBasePath: string,
  language?: string,
): string[] {
  const args = [
    '-m',
    modelPath,
    '-f',
    inputPath,
    '-otxt',
    '-of',
    outputBasePath,
  ]
  if (language) {
    args.push('-l', language)
  }
  return args
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const killed = error as Error & { killed?: boolean; signal?: string | null }
    if (killed.killed || killed.signal) {
      return error.message || 'Local transcription timed out'
    }
    return error.message || 'Local transcription failed'
  }
  return 'Local transcription failed'
}

export function createLocalTranscriptionService(
  options: CreateLocalTranscriptionServiceOptions = {},
): LocalTranscriptionService {
  const command = options.command?.trim() ?? ''
  const model = options.model?.trim() ?? ''
  const timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? Math.trunc(options.timeoutMs)
    : 45000
  const execImpl = options.execFileImpl ?? (async (file, args, execOptions) => execFileAsync(file, args, execOptions))

  return {
    isConfigured: command.length > 0 && model.length > 0,
    async transcribeAudio(audio, transcriptionOptions) {
      if (!command || !model) {
        throw new Error('Local transcription is not configured')
      }

      await stat(model)

      const tempDir = await mkdtemp(join(tmpdir(), 'codex-web-local-stt-'))
      const inputPath = join(tempDir, 'input.webm')
      const outputBasePath = join(tempDir, 'output')
      const startedAt = Date.now()

      try {
        await writeFile(inputPath, audio)
        await execImpl(
          command,
          buildWhisperArgs(model, inputPath, outputBasePath, transcriptionOptions.language ?? options.language),
          {
            timeout: timeoutMs,
            maxBuffer: 10 * 1024 * 1024,
          },
        )
        const text = (await readFile(`${outputBasePath}.txt`, 'utf8')).trim()
        return {
          text,
          language: transcriptionOptions.language ?? options.language ?? null,
          durationMs: Date.now() - startedAt,
          engine: 'local',
        }
      } catch (error) {
        throw new Error(normalizeErrorMessage(error))
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    },
  }
}

export async function parseTranscriptionFormData(req: IncomingMessage): Promise<{
  audio: Buffer
  mimeType: string
  language?: string
}> {
  const request = new Request('http://localhost/api/transcriptions', {
    method: req.method ?? 'POST',
    headers: req.headers as HeadersInit,
    body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })

  const formData = await request.formData()
  const audio = formData.get('audio')
  if (!(audio instanceof File)) {
    throw new Error('Missing audio upload')
  }

  const language = formData.get('language')
  const audioBuffer = Buffer.from(await audio.arrayBuffer())

  return {
    audio: audioBuffer,
    mimeType: audio.type || 'application/octet-stream',
    language: typeof language === 'string' && language.trim().length > 0 ? language.trim() : undefined,
  }
}
