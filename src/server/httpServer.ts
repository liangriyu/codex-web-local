import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express, { type Express } from 'express'
import compression from 'compression'
import { createCodexBridgeMiddleware } from './codexAppServerBridge.js'
import { createAuthMiddleware } from './authMiddleware.js'
import {
  createLocalTranscriptionService,
  parseTranscriptionFormData,
  type LocalTranscriptionConfig,
  type LocalTranscriptionService,
} from './transcriptionService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

export type ServerOptions = {
  password?: string
  transcriptionConfig?: LocalTranscriptionConfig
  transcriptionService?: LocalTranscriptionService
}

export type ServerInstance = {
  app: Express
  dispose: () => void
}

export function createServer(options: ServerOptions = {}): ServerInstance {
  const app = express()
  const bridge = createCodexBridgeMiddleware()
  const transcriptionService = options.transcriptionService
    ?? createLocalTranscriptionService(options.transcriptionConfig)

  // Enable gzip/br compression by default, except SSE streams.
  app.use(compression({
    filter: (req, res) => {
      const contentType = String(res.getHeader('Content-Type') ?? '')
      if (contentType.includes('text/event-stream')) {
        return false
      }
      return compression.filter(req, res)
    },
  }))

  // 1. Auth middleware (if password is set)
  if (options.password) {
    app.use(createAuthMiddleware(options.password))
  }

  app.post('/api/transcriptions', async (req, res) => {
    if (!transcriptionService.isConfigured) {
      res.status(503).json({ error: 'Local transcription is not configured' })
      return
    }

    try {
      const payload = await parseTranscriptionFormData(req)
      const result = await transcriptionService.transcribeAudio(payload.audio, {
        mimeType: payload.mimeType,
        language: payload.language,
      })
      res.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local transcription failed'
      const status = /missing audio/i.test(message) ? 400 : 500
      res.status(status).json({ error: message })
    }
  })

  // 2. Bridge middleware for /codex-api/*
  app.use(bridge)

  // 3. Static files from Vue build
  app.use(express.static(distDir))

  // 4. SPA fallback
  app.use((_req, res) => {
    res.sendFile(join(distDir, 'index.html'))
  })

  return {
    app,
    dispose: () => bridge.dispose(),
  }
}
