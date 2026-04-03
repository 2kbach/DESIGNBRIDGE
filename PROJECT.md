# CLAUDE DESIGNED

## What We're Building
A suite of tools that let product designers build and iterate on software visually — without reading or editing code directly. The flagship tool is **DesignBridge**, a Chrome extension that lets you select any element on a rendered web page, describe what you want changed in plain language, and have Claude Code automatically find the source file and make the edit.

## Why
Every existing developer tool assumes the user wants to look at code. For designers building with AI, the workflow is inverted: you're looking at the output, you see what's wrong, and the bottleneck is translating "this button looks wrong" into "find ButtonGroup.jsx line 47 and change the padding." CLAUDE DESIGNED eliminates that translation step.

## Key Features
- **DesignBridge Chrome Extension** — hover-to-highlight, click-to-select, describe changes in plain language, send to Claude Code
- **Bridge Server** — lightweight Node.js server that pipes structured prompts to Claude Code CLI
- **Clipboard Fallback** — works without bridge server by copying structured prompts
- **Apple HIG Design Language** — native macOS/Safari aesthetic throughout

## Tech Stack
- Chrome Extension (Manifest V3) — vanilla JS, no build step
- Node.js bridge server (~70 lines)
- Claude Code CLI integration

## Version
v0.2.0

## Case Study
> **2026-04-02** — Started CLAUDE DESIGNED as a concept project for designer-first AI tools. The flagship product is DesignBridge, a Chrome extension. The core insight: designers who build with AI don't want to context-switch to code editors. They're staring at the rendered output — the browser IS their IDE. Built the entire v1 in one session: content script handles all the DOM interaction (hover highlight, click-to-select, floating panel), a tiny Node bridge server pipes structured prompts to Claude Code CLI, and the extension falls back to clipboard if the bridge isn't running. No build step, no frameworks — just vanilla JS that gets injected into any page. The prompt engineering was key: capturing the right amount of context (computed styles, parent DOM structure, viewport info) without overwhelming Claude with noise.
>
> **2026-04-02** — Restyled the entire extension to match Apple's Human Interface Guidelines. Popup uses SF Pro, system colors, native toggle switches, stepper controls, and grouped list sections like iOS Settings. The floating panel uses macOS-style frosted glass (backdrop-filter blur), system radius corners, and Apple's blue accent. Overlay highlight was softened to match Safari Web Inspector. Full dark mode using Apple's dark palette.

## Changelog
- **2026-04-02** ✅ v0.1.0 — Initial build: manifest, content script, styles, background worker, popup, bridge server, icons
- **2026-04-02** ✅ v0.2.0 — Apple HIG redesign: SF Pro fonts, system colors, toggle switches, frosted glass panel, Safari-style overlay

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
