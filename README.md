# AI Plug Hub

Manage plugins, skills, and extensions across all your AI tools — in one place.

AI Plug Hub is a desktop app that gives you a unified view of everything installed across Claude Code, Claude Desktop, Gemini CLI, and Antigravity. Browse marketplaces, install with one click, export your setup as a shareable bundle, and import a teammate's config in seconds.

No terminal required. No JSON editing. Just a clean GUI.

## What it does

| | |
|---|---|
| **Detect** | Auto-finds Claude Code and Claude Desktop on your machine |
| **View** | See all installed components (MCP servers, skills, commands, hooks) grouped by tool |
| **Browse** | Search and filter marketplace plugins, read details, install directly |
| **Install / Uninstall** | From marketplace, URL, or local file — one click into the right tool |
| **Enable / Disable** | Toggle components on/off without removing them |
| **Export** | Select components, strip secrets automatically, save as `.aibundle` |
| **Import** | Open a bundle, resolve conflicts inline, get prompted for missing secrets |
| **Drag & Drop** | Drop an `.aibundle` file onto the app from any tab to start importing |

## Quick start

```bash
git clone <repo-url>
cd 7A-app
npm install
npm run dev
```

On first launch, AI Plug Hub scans your machine for supported AI tools and shows what's installed.

## Build & distribute

```bash
# Windows installer (.exe, ~97MB)
npm run dist

# Output → dist/AI Plug Hub Setup 0.1.0.exe
# Send this file to anyone — they double-click to install.

# Portable (no installer) → zip dist/win-unpacked/ and share

# Other platforms
npm run dist:mac     # → dist/AI Plug Hub-0.1.0.dmg
npm run dist:linux   # → dist/AI Plug Hub-0.1.0.AppImage
npm run dist:all     # → all platforms at once
```

## Development

```bash
npm install          # Install dependencies
npm run dev          # Launch with hot reload
npm run build        # Production build (without packaging)
```

## Scripts

```
npm run dev          # Launch with hot reload
npm run build        # Production build
npm run dist         # Build + package Windows installer
npm run dist:mac     # Build + package macOS .dmg
npm run dist:linux   # Build + package Linux AppImage
npm run dist:all     # Build + package all platforms
npm test             # Run tests (1803 passing)
npm run lint         # ESLint
npm run format       # Prettier
npm run typecheck    # TypeScript strict check
npm run test:e2e     # Playwright E2E tests (28 tests)
```

## Tech stack

- **Electron 41** — cross-platform desktop shell
- **React 19 + TypeScript 5.9** — renderer
- **Tailwind v4 + Radix UI** — styling and accessible primitives
- **Zustand** — state management
- **Fuse.js** — client-side fuzzy search
- **Vitest + React Testing Library** — 1803 unit/integration tests
- **Playwright** — 28 E2E tests (smoke + critical flows + accessibility)

## How it works

AI Plug Hub has three tabs:

**My Setup** — Your installed components, grouped by tool. Expand a tool section to see its MCP servers, skills, commands, and hooks. Click any component for a detail panel with metadata, toggle, uninstall, and "show in explorer."

**Browse** — A storefront connected to marketplace sources (GitHub-based or custom URL indexes). Search, filter by tool/type, sort by name or date. Click a result to see its full description and install it.

**Transfer** — Export your setup as a portable `.aibundle` file. Secrets (API keys, tokens) are automatically stripped and recipients get prompted to provide their own. Import a bundle to see what's new, what conflicts, and what's incompatible — resolve inline with dropdowns, then install.

## Bundle format

Bundles are JSON files with the `.aibundle` extension:

```json
{
  "formatVersion": "1.0",
  "name": "my-team-setup",
  "exportedFrom": { "tools": ["claude-code"], "date": "2026-03-20T..." },
  "components": [
    {
      "type": "mcp-server",
      "name": "sqlite-mcp",
      "core": { "transport": "stdio", "command": "sqlite-mcp" },
      "requiredConfig": [
        { "key": "API_KEY", "sensitive": true, "envVar": "API_KEY" }
      ]
    }
  ]
}
```

Secrets are never included. The `requiredConfig` array tells the recipient what they need to provide.

## Supported tools

| Tool | Status | Component types |
|------|--------|----------------|
| Claude Code | Supported | MCP servers, skills, commands, hooks, agents |
| Claude Desktop | Supported | MCP servers |
| Gemini CLI | Planned | MCP servers, extensions |
| Antigravity | Planned | MCP servers, skills, workflows, rules |

## Architecture

```
main process          preload           renderer
─────────────         ────────          ─────────
AdapterRegistry  ──►  contextBridge ──► Zustand stores
  ClaudeCodeAdapter    (typed API)       toolStore
  ClaudeDesktopAdapter                   browseStore
ConfigIO                                 wizardStore
DataStore                                uiStore
SecretStore                            React components
BundleEngine                             My Setup / Browse / Transfer
MarketplaceClient
Logger
```

All IPC uses typed channels with `IpcResult<T>` — success returns data, errors return structured `{ code, message, recoverable }`. The preload unwraps this so the renderer gets clean `Promise<T>` or thrown errors.

## Design

Warm Sand palette — cream backgrounds, earth-tone accents. Component types get distinct colors: teal (MCP), violet (skill), blue (command), orange (hook). Red is reserved for destructive actions only.

## Status

M0–M8 complete. Plugin system integration shipped. 97% test coverage. User validation passed (20/20 scenarios).

## License

TBD
