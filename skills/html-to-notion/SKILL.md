---
name: html-to-notion
description: Use when converting HTML files, reports, notebooks, or dashboards to Notion-importable format — especially when source contains Mermaid diagrams, styled tables, CSS visual components, callout boxes, timelines, or code blocks that need migration to Notion via Markdown import
---

## Overview

Converts rich HTML into Notion-importable Markdown ZIP archives, preserving Mermaid diagrams as native code blocks with PNG fallbacks and screenshotting CSS-only visual components.

## When to Use

- Converting HTML reports, notebooks, or dashboards to Notion
- Preserving Mermaid diagrams with native Notion rendering
- Migrating styled HTML with CSS components (progress bars, stat cards, timelines)
- Need a ZIP ready for Notion's "Import Markdown & CSV" feature

## Quick Start

```bash
npm install && pip install -r requirements.txt
npx playwright install chromium
npx html-to-notion convert report.html -o output/
```

Upload `notion_import.zip` to Notion via Settings > Import > Markdown & CSV.

## How It Works

Pipeline: `converter.py` (HTML to Markdown + manifest) -> `screenshotter.js` + `mermaid-renderer.js` (PNGs via Playwright) -> `assembler.js` (bundle into ZIP).

## What's Preserved vs Lost

| Element | Status | Notes |
|---------|--------|-------|
| Text, headings, lists | Preserved | Full inline formatting (bold, italic, code, links) |
| Mermaid diagrams | Native | Set code block language to "Mermaid" after import |
| Code blocks | Preserved | With syntax highlighting hints |
| Tables | Structure only | Cell colors and styling lost |
| Callout boxes | Mapped | Blockquotes with emoji prefix, convertible to Notion callouts |
| Progress bars | Screenshot | Static PNG + text fallback |
| Stat card grids | Screenshot | Static PNG + table fallback |
| Timelines | Screenshot | Static PNG + text fallback |
| Hero/banner sections | Screenshot | Static PNG |
| CSS styling | Lost | Fonts, colors, gradients, shadows |
| Side-by-side layouts | Lost | Rendered sequentially |

## CLI Reference

```
html-to-notion convert <input.html> [options]

Options:
  -o, --output <dir>      Output directory (default: ./notion_export/)
  --no-screenshots        Skip Playwright screenshots of CSS components
  --no-mermaid-png        Skip Mermaid PNG fallback rendering
  --viewport <width>      Viewport width for screenshots (default: 1200)
  --mermaid-theme <name>  Mermaid theme: default, neutral, dark, forest, base (default: neutral)
  --no-zip                Skip ZIP creation (ZIP created by default)
  -v, --verbose           Show detailed progress
  -h, --help              Show help
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Mermaid diagrams show as plain code | Click code block in Notion, change language to "Mermaid" |
| Screenshots missing | Run `npx playwright install chromium` first |
| Python errors on import | Run `pip install -r requirements.txt` (needs beautifulsoup4) |
| Callouts render as blockquotes | Select blockquote in Notion > Turn into > Callout |

## Post-Import Steps

1. **Mermaid diagrams**: Click each code block containing Mermaid syntax and set the language to "Mermaid" for native rendering.
2. **Callout boxes**: Select blockquotes with emoji prefixes, click "Turn into" > "Callout", and set the icon to match the emoji.
3. **Emoji mapping**: Blue = info/insight, Green = success, Red = danger/error, Yellow = warning.
