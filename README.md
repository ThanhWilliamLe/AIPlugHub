![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Tests](https://img.shields.io/badge/tests-1%2C778-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-public%20preview-orange)

# AI Plug Hub

**One app to manage plugins across all your AI tools.**

Your AI tools each have their own plugins, their own config files, and their own install steps. AI Plug Hub puts everything in one place -- browse, install, and share plugins across Claude Code, Claude Desktop, Gemini CLI, and Antigravity without memorizing each tool's config format. Export a bundle and onboard your whole team at once.

![My Setup tab showing installed plugins across Claude Code, Gemini CLI, and Antigravity](docs/screenshots/my-setup-tab.png)

## What it does

- **See all your plugins in one view** -- user-level and project-level, across every tool
- **Browse and install** from marketplace sources, sorted by popularity with star counts
- **Check for updates** -- detect available updates and review changes before applying
- **Enable, disable, or uninstall** any plugin from any supported tool
- **Export your setup** as a bundle file and onboard your whole team to the same config
- **Import a bundle** on a new machine and get the exact same setup quickly
- **Bulk operations** -- select multiple plugins and act on them at once
- **Backup and restore** -- snapshot your config before experimenting

## Supported tools

| Tool | What it is | Plugin types |
|------|-----------|--------------|
| **Claude Code** | Anthropic's CLI coding assistant | MCP servers, skills, commands, hooks, agents, context files |
| **Claude Desktop** | Anthropic's desktop chat app | MCP servers |
| **Gemini CLI** | Google's CLI coding assistant | MCP servers, skills, commands, hooks, agents, context files |
| **Antigravity** | AI-powered IDE with skills, workflows, and extensions | MCP servers, skills, commands, context files |

## Quick start

### Download

Grab the latest release:

- **[Windows installer (.exe)](https://github.com/ThanhWilliamLe/aiplughub/releases/latest)** -- double-click to install
- **[Windows portable (.exe)](https://github.com/ThanhWilliamLe/aiplughub/releases/latest)** -- no install needed, run directly
- macOS -- coming soon
- Linux -- coming soon

### Build from source

```bash
git clone https://github.com/ThanhWilliamLe/aiplughub.git
cd aiplughub
npm install
npm run dev
```

Build from source is optional -- the download above is all you need. Building requires Node.js 18+ and npm.

## How it works

1. **Detect** -- On first launch, the app scans your machine for installed AI tools and finds their plugins automatically.
2. **View** -- See everything you have installed, grouped by tool. Check details, status, and configuration at a glance.
3. **Browse** -- Search plugin sources (GitHub-based marketplaces, URL indexes) to find new plugins.
4. **Install** -- Pick a plugin, pick which tool to install it for, and the app writes the correct config in the correct format.
5. **Export / Import** -- Package your setup into a bundle file. Send it to a teammate, move it to another machine, or keep it as a backup.

![Browse tab with marketplace sources, popularity sort, and star counts](docs/screenshots/browse-tab.png)

## Bundle sharing

Bundles are how you move plugin setups between machines and people.

**Exporting:** Select the plugins you want to include, and AI Plug Hub creates a single bundle file. The bundle knows which tools each plugin belongs to, so nothing gets lost in translation.

![Transfer tab with Export and Import options](docs/screenshots/transfer-tab.png)

**Importing:** Open a bundle file and AI Plug Hub shows you what's inside. If anything conflicts with your existing setup, the app walks you through it -- you decide what to keep, what to replace, and what to skip.

Bundles handle secrets carefully. API keys and tokens are detected and stripped automatically during export. Sensitive values stay out of bundles by default.

## Public preview

AI Plug Hub is in **public preview**. Core features are implemented and backed by 1,778 tests (including endurance suites), but it hasn't had wide real-world usage yet. Windows is available now; macOS and Linux are coming soon.

This is real software you can download and run today -- not a prototype, not a waitlist. Your feedback will shape what comes next.

## Feedback

The most helpful thing you can do right now is try it and report what happens.

**[Open an issue](https://github.com/ThanhWilliamLe/aiplughub/issues)**

What's most useful:

- Bug reports with steps to reproduce
- Which AI tools you use and how the detection worked (or didn't)
- Plugins that failed to install or didn't show up
- Anything confusing in the UI
- What you wish it did differently

<details>
<summary><strong>Development</strong></summary>

```
npm install          # Install dependencies
npm run dev          # Launch with hot reload
npm run build        # Production build
npm run dist         # Build + package Windows installer
npm run dist:mac     # Build + package macOS .dmg
npm run dist:linux   # Build + package Linux AppImage
npm test             # Run tests (1778 passing)
npm run lint         # ESLint
npm run typecheck    # TypeScript strict check
```

**Tech stack:** Electron 41, React 19, TypeScript 5.9, Tailwind v4, Radix UI, Zustand, Vitest + Playwright

</details>

## License

MIT -- see [LICENSE](LICENSE) for details.
