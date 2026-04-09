---
name: html-to-notion
description: Use when converting HTML files, reports, notebooks, or dashboards to Notion-importable format -- especially when source contains Mermaid diagrams, styled tables, CSS visual components, callout boxes, timelines, or code blocks that need migration to Notion via Markdown import
license: MIT
compatibility: Requires Node.js >= 18, Python >= 3.8, Playwright with Chromium, and beautifulsoup4
metadata:
  author: razpetel
  version: "1.0.0"
---

## Overview

Converts rich HTML into Notion-importable Markdown ZIP archives, preserving Mermaid diagrams as native code blocks with PNG fallbacks and screenshotting CSS-only visual components.

## When to Use

- Converting HTML reports, notebooks, or dashboards to Notion
- Preserving Mermaid diagrams with native Notion rendering
- Migrating styled HTML with CSS components (progress bars, stat cards, timelines)
- Need a ZIP ready for Notion's "Import Markdown & CSV" feature

## Prerequisites

Verify that all required tools are installed before running:

```bash
# Python >= 3.8
python3 --version

# Node.js >= 18
node --version

# Playwright with Chromium
npx playwright install chromium

# Python dependencies
pip install beautifulsoup4
```

## Quick Start

```bash
npm install && pip install -r requirements.txt
npx playwright install chromium
node scripts/html-to-notion.js convert report.html -o output/
```

Upload `notion_import.zip` to Notion via Settings > Import > Markdown & CSV.

## Examples

Given a source HTML file `report.html`, the tool produces:

```
output/
  notion_import.zip          # Ready to upload to Notion
  report.md                  # Converted Markdown
  images/
    mermaid-1.png             # Mermaid diagram PNG fallback
    mermaid-2.png             # Mermaid diagram PNG fallback
    screenshot-progress.png   # CSS component screenshot
    screenshot-stats.png      # CSS component screenshot
  manifest.json              # Conversion metadata
```

## How It Works

Pipeline: `scripts/converter.py` (HTML to Markdown + manifest) -> `scripts/screenshotter.js` + `scripts/mermaid-renderer.js` (PNGs via Playwright) -> `scripts/assembler.js` (bundle into ZIP).

## What's Preserved vs Lost

| Element | Status | Notes |
|---------|--------|-------|
| Text, headings, lists | Preserved | Full inline formatting (bold, italic, code, links) |
| Mermaid diagrams | Native | Set code block language to "Mermaid" after import |
| Code blocks | Preserved | With syntax highlighting hints |
| Tables | Structure only | Cell colors and styling lost |
| Callout boxes | Mapped | Blockquotes with emoji prefix, convertible to Notion callouts |
| Colored badges | [badge text] | Plain text |
| Progress bars | Screenshot | Static PNG + text fallback |
| Stat card grids | Screenshot | Static PNG + table fallback |
| Timelines | Screenshot | Static PNG + text fallback |
| Hero/banner sections | Screenshot | Static PNG |
| CSS styling | Lost | Fonts, colors, gradients, shadows |
| Side-by-side layouts | Lost | Rendered sequentially |

## CLI Reference

```
node scripts/html-to-notion.js convert <input.html> [options]

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
