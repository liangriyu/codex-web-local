Language: English | [简体中文](./README.zh-CN.md)

# `npx @leibnizhu/codex-web-local`

A lightweight web interface for [Codex](https://github.com/openai/codex) that replicates the desktop UI and runs on top of the Codex `app-server`. It exposes Codex through a web application, allowing you to access your local Codex instance remotely from any browser.

## Prerequisites

- [Codex CLI](https://github.com/openai/codex) installed and available in your `PATH`

## Installation

```bash
# Run directly with npx (no install required)
npx @leibnizhu/codex-web-local

# Or install globally
npm install -g @leibnizhu/codex-web-local
```

## Usage

```
Usage: codex-web-local [options]

Web interface for Codex app-server

Options:
  -p, --port <port>    port to listen on (default: "3000")
  --host <host>        host to bind (e.g. 127.0.0.1 / 0.0.0.0 / 100.x.x.x)
  -d, --daemon         run in background (daemon mode)
  --password <pass>    set a specific password
  --no-password        disable password protection
  --https-cert <path>  path to the HTTPS certificate (PEM)
  --https-key <path>   path to the HTTPS private key (PEM)
  -h, --help           display help for command
```

## Examples

### Runtime Commands (production/daily usage)

```bash
# Start with auto-generated password on default port 3000
codex-web-local

# Start on a custom port
codex-web-local --port 8080

# Start with a specific password
codex-web-local --password my-secret

# Start without password protection (use only on trusted networks)
codex-web-local --no-password

# Start in daemon mode (run in background)
codex-web-local --daemon

# Start with an explicit bind host (listen on all interfaces)
codex-web-local --host 0.0.0.0

# Tailscale setup in daemon mode (background)
codex-web-local --host "$(tailscale ip -4)" --port 3000 --daemon

# Enable HTTPS
codex-web-local \
  --host 0.0.0.0 \
  --port 3443 \
  --https-cert ./certs/dev.pem \
  --https-key ./certs/dev-key.pem

```

### Dev Commands (Vite)

```bash
# Dev mode, expose to LAN
npm run dev -- --host 0.0.0.0

# Dev mode, bind to this machine's Tailscale IPv4
npm run dev -- --host "$(tailscale ip -4)"

# Dev mode in daemon (background)
npm run dev -- --host 0.0.0.0 --daemon

```

When started with password protection (default), the server prints the password to the console. Open the URL in your browser, enter the password, and you're in.

That web access password only protects the `codex-web-local` site itself. It is separate from the OpenAI / Codex account shown inside the UI's Account Center.

## Account Center: Desktop Sign-In, Mobile Switching

- Account login actions (ChatGPT OAuth / API Key) are desktop-only.
- Mobile (`<=720px`) only supports profile switching and status viewing.
- Multi-account is managed with account profiles:
  - create a new profile on desktop, then complete login in that profile
  - switch profiles any time from Account Center (desktop and mobile)
- Web access password is still independent from OpenAI / Codex account auth state.

## UI Highlights

- Composer status bar now shows:
  - current git branch
  - context window usage ring with detailed hover info
  - remaining quota hover card
- Sidebar and mobile header now expose a first-level Account Center entry:
  - review the current OpenAI / Codex account state
  - switch between account profiles
  - start ChatGPT/API Key login only on desktop
  - log out or re-authenticate without changing the web access password
- Composer now supports voice input:
  - browsers with native speech recognition can fill transcripts back into the composer
  - browsers without native recognition can use a server-side voice fallback only when the server explicitly enables it
  - transcripts are inserted back into the input box and are not auto-sent
- Context hover card supports manual compaction via "Compact Now" (calls `thread/compact/start`).
- Thread list uses `name` as the primary title. `preview` is shown in tooltip, not inline on hover.
- You can continue typing while the model is still responding. New sends are queued and auto-sent after the current turn finishes.

## Voice Input Notes

- Voice input never changes the thread message protocol. It only writes transcripts back into the composer text area.
- Native browser speech recognition remains the primary path.
- Local offline STT is still removed; the fallback path is `codex-web-local` private RPC bridged to a server-side voice provider.
- Supported fallback providers:
  - `openai`: `gpt-4o-mini-transcribe`
  - `zhipu`: `glm-asr-2512`
- Select the provider with `CODEX_WEB_LOCAL_VOICE_INPUT_PROVIDER=openai|zhipu`.
- OpenAI fallback requires both:
  - `OPENAI_API_KEY`
  - `CODEX_WEB_LOCAL_OPENAI_TRANSCRIBE_ENABLED=1`
- Zhipu fallback requires both:
  - `ZHIPU_API_KEY`
  - `CODEX_WEB_LOCAL_ZHIPU_TRANSCRIBE_ENABLED=1`
- iPhone and LAN browser access should still prefer HTTPS when using browser recording fallback.
- Mobile ChatGPT OAuth may open a new tab or external browser. If the page reloads, reopen Account Center and it will refresh from `account/read`.

## Daemon Notes

- `codex-web-local --daemon` runs the CLI server in background and prints `PID`.
- `npm run dev -- --daemon` runs the Vite dev server in background and prints `PID`.
- To stop a daemon process:

```bash
kill <PID>
```

## Documentation

- Docs index: [docs/README.md](./docs/README.md)
- Contracts guide: [docs/contracts/README.md](./docs/contracts/README.md)
- Chinese app-server doc: [docs/contracts/APP_SERVER_DOCUMENTATION.zh-CN.md](./docs/contracts/APP_SERVER_DOCUMENTATION.zh-CN.md)

## Contributing

Issues and pull requests are welcome! If you have ideas, suggestions, or found a bug, please open an issue on the [GitHub repository](https://github.com/Leibnizhu/codex-web-local/issues).

## License

[MIT](./LICENSE)
