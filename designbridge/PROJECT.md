# DESIGNBRIDGE

## What We're Building
A Chrome extension that lets product designers select any element on a rendered web page, describe what they want changed in plain language, and have Claude Code automatically find the source file and make the edit — without ever leaving the browser.

## Why
Every existing tool assumes the designer wants to look at code. For a designer building with AI, the workflow is inverted: you're looking at the output, you see what's wrong, and the bottleneck is translating "this button looks wrong" into "find ButtonGroup.jsx line 47 and change the padding." DesignBridge eliminates that translation step.

## Tech Stack
- **Chrome Extension** (Manifest V3) — content script + service worker + popup
- **Bridge Server** — ~70 lines of Node.js, pipes prompts to Claude Code CLI
- **No build step** — vanilla JS, no frameworks, no bundler

## Key Features (v0.1.0)
- Hover-to-highlight elements with bounding box + label
- Click-to-select with floating instruction panel
- DOM context capture (CSS selector, computed styles, parent structure)
- Send to Claude Code via local bridge server
- Clipboard fallback when bridge is unreachable
- Cmd+Shift+X keyboard shortcut to toggle inspect mode
- Settings popup (style capture presets, context depth, bridge URL)
- Dark mode support

## Architecture
```
Chrome Extension → HTTP POST → Bridge Server (localhost:7890) → Claude Code CLI → File edits → HMR reload
```

## Version
**v0.1.0** — Initial build

## Changelog
- **2026-04-02** ✅ v0.1.0 — Initial project scaffolding: manifest.json, content.js (hover/select/panel/DOM capture), styles.css (light+dark), background.js (screenshot/shortcuts), popup.html/js (settings), bridge.js (Claude CLI piping), extension icons

## Case Study

> **2026-04-02** — Started DesignBridge as a Chrome extension concept. The core insight: designers who build with AI don't want to context-switch to code editors. They're staring at the rendered output — the browser IS their IDE. Built the entire v1 in one session: content script handles all the DOM interaction (hover highlight, click-to-select, floating panel), a tiny Node bridge server pipes structured prompts to Claude Code CLI, and the extension falls back to clipboard if the bridge isn't running. No build step, no frameworks — just vanilla JS that gets injected into any page. The prompt engineering was key: capturing the right amount of context (computed styles, parent DOM structure, viewport info) without overwhelming Claude with noise.

## Feature Parking Lot
- **2026-04-02** — Live diff preview in browser before accepting changes *(from spec)*
- **2026-04-02** — Source map integration to show actual filename + line in the floating panel *(from spec)*
- **2026-04-02** — "Fix all like this" — apply same change to matching elements *(from spec)*
- **2026-04-02** — MCP server mode — Claude Desktop connects to the extension as a tool source *(from spec)*
- **2026-04-02** — Multi-project support in bridge server *(from spec)*
- **2026-04-02** — Region/multi-element selection via drag *(from spec)*
- **2026-04-02** — Figma image attachment support *(from spec)*
- **2026-04-02** — Element change history for the session *(from spec)*
- **2026-04-02** — Claude's full response shown in the floating panel *(from spec)*
