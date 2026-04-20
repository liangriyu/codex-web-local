import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express, { type Express } from 'express'
import compression from 'compression'
import { createCodexBridgeMiddleware } from './codexAppServerBridge.js'
import { createAuthMiddleware } from './authMiddleware.js'
import type { VoiceInputFallbackConfig } from './transcriptionService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')

export type ServerOptions = {
  password?: string
  voiceInputFallback?: VoiceInputFallbackConfig
  serverMode?: 'shared' | 'isolated'
}

export type ServerInstance = {
  app: Express
  dispose: () => void
}

export function createServer(options: ServerOptions = {}): ServerInstance {
  const app = express()
  const bridge = createCodexBridgeMiddleware({
    serverMode: options.serverMode ?? 'isolated',
    voiceInputFallback: options.voiceInputFallback ?? {
      provider: 'openai',
      enabled: false,
      model: 'gpt-4o-mini-transcribe',
    },
  })

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

  // 2. Bridge middleware for /codex-api/*
  app.use(bridge)

  // 3. Static files from Vue build
  app.use(express.static(distDir, {
    dotfiles: 'allow',
  }))

  // 4. SPA fallback
  app.use((_req, res) => {
    res.sendFile(join(distDir, 'index.html'), {
      dotfiles: 'allow',
    })
  })

  return {
    app,
    dispose: () => bridge.dispose(),
  }
}
