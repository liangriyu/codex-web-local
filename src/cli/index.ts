import { readFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { spawn } from 'node:child_process'
import { Command } from 'commander'
import { createServer as createApp } from '../server/httpServer.js'
import { generatePassword } from '../server/password.js'
import { formatAccessUrl, normalizeCliRuntimeConfig } from './runtimeConfig.js'

const program = new Command()
  .name('codex-web-local')
  .description('Web interface for Codex app-server')
  .option('-p, --port <port>', 'port to listen on', '3000')
  .option('--host <host>', 'host to bind (e.g. 127.0.0.1, 0.0.0.0, 100.x.x.x)')
  .option('-d, --daemon', 'run in background (daemon mode)')
  .option('--password <pass>', 'set a specific password')
  .option('--no-password', 'disable password protection')
  .option('--https-cert <path>', 'path to the HTTPS certificate (PEM)')
  .option('--https-key <path>', 'path to the HTTPS private key (PEM)')
  .option('--stt-command <path>', 'path to the local speech-to-text executable')
  .option('--stt-model <path>', 'path to the local speech-to-text model')
  .option('--stt-language <code>', 'default speech-to-text language code')
  .option('--stt-timeout-ms <ms>', 'local speech-to-text timeout in milliseconds', '45000')
  .parse()

const runtimeConfig = normalizeCliRuntimeConfig(program.opts<{
  port: string
  host?: string
  daemon?: boolean
  password: string | boolean
  httpsCert?: string
  httpsKey?: string
  sttCommand?: string
  sttModel?: string
  sttLanguage?: string
  sttTimeoutMs?: string
}>())
const port = runtimeConfig.port
const host = runtimeConfig.host

let password: string | undefined
if (runtimeConfig.password === false) {
  password = undefined
} else if (typeof runtimeConfig.password === 'string') {
  password = runtimeConfig.password
} else {
  password = generatePassword()
}

function buildDaemonArgs(): string[] {
  const sourceArgs = process.argv.slice(1)
  const filtered = sourceArgs.filter((arg) => arg !== '-d' && arg !== '--daemon')

  const hasPasswordArg = filtered.some((arg) => arg === '--password' || arg === '--no-password')
  if (!hasPasswordArg) {
    if (password) {
      filtered.push('--password', password)
    } else {
      filtered.push('--no-password')
    }
  }

  return filtered
}

if (runtimeConfig.daemon) {
  const child = spawn(process.execPath, buildDaemonArgs(), {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      CODEX_WEB_LOCAL_DAEMON: '1',
    },
  })
  child.unref()

  const lines = [
    '',
    'Codex Web Local daemon started.',
    '',
    `  PID:      ${String(child.pid)}`,
    `  Local:    ${formatAccessUrl(host, port, Boolean(runtimeConfig.https))}`,
  ]
  if (password) {
    lines.push(`  Password: ${password}`)
  }
  lines.push('')
  console.log(lines.join('\n'))
  process.exit(0)
}

const { app, dispose } = createApp({
  password,
  transcriptionConfig: runtimeConfig.transcription,
})
const server = runtimeConfig.https
  ? createHttpsServer({
      cert: readFileSync(runtimeConfig.https.cert),
      key: readFileSync(runtimeConfig.https.key),
    }, app)
  : createHttpServer(app)

server.listen(port, host, () => {
  const lines = [
    '',
    'Codex Web Local is running!',
    '',
    `  Local:    ${formatAccessUrl(host, port, Boolean(runtimeConfig.https))}`,
  ]

  if (password) {
    lines.push(`  Password: ${password}`)
  }

  lines.push('')
  console.log(lines.join('\n'))
})

function shutdown() {
  console.log('\nShutting down...')
  server.close(() => {
    dispose()
    process.exit(0)
  })
  // Force exit after timeout
  setTimeout(() => {
    dispose()
    process.exit(1)
  }, 5000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
