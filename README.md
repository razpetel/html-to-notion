# html-to-notion

[![npm version](https://img.shields.io/npm/v/html-to-notion)](https://www.npmjs.com/package/html-to-notion)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

Convert rich HTML documents into Notion-importable Markdown ZIP archives with screenshot preservation of CSS visual components and native Mermaid diagram support.

## Features

- [x] HTML to Markdown conversion with full inline formatting (bold, italic, code, links)
- [x] Native Mermaid diagram code blocks with PNG fallback images
- [x] Automated screenshots of CSS-only components (progress bars, stat cards, timelines)
- [x] Callout box mapping to Notion-compatible blockquote syntax
- [x] GFM table conversion from HTML tables
- [x] Hero/banner section capture
- [x] Ready-to-upload ZIP archive for Notion import
- [x] Configurable viewport width for screenshots
- [x] Skip screenshots mode for text-only conversion

## Installation

### Claude Code Plugin (Recommended)

Install directly in [Claude Code](https://claude.ai/code) as a skill:

```
/plugin marketplace add razpetel/html-to-notion
/plugin install html-to-notion@razpetel
```

Once installed, Claude Code will automatically detect when you need to convert HTML to Notion and use this skill. You can also invoke it explicitly with `/html-to-notion`.

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/razpetel/html-to-notion.git
cd html-to-notion

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt

# Install Playwright browser (required for screenshots)
npx playwright install chromium
```

## Quick Start

```bash
# 1. Convert your HTML file
npx html-to-notion convert my-report.html -o output/

# 2. Find the ZIP in the output directory
ls output/notion_import.zip

# 3. Import into Notion: Settings > Import > Markdown & CSV > Upload ZIP
```

## What Gets Preserved

| Element | Conversion | Notion Result |
|---------|-----------|---------------|
| Headings (h1-h4) | Markdown `#` syntax | Native headings |
| Paragraphs, lists | Markdown text | Native text blocks |
| Bold, italic, code | `**bold**`, `*italic*`, `` `code` `` | Inline formatting |
| Links | `[text](url)` | Clickable links |
| Mermaid diagrams | Fenced code block + PNG fallback | Native diagrams (after setting language) |
| Code blocks | Fenced code blocks | Syntax-highlighted blocks |
| HTML tables | GFM pipe tables | Native Notion tables |
| Callout boxes | Blockquotes with emoji prefix | Convertible to native callouts |
| Progress bars | PNG screenshot + text fallback | Static image |
| Stat card grids | PNG screenshot + table fallback | Static image + data |
| Timelines | PNG screenshot + text list | Static image + text |
| Hero/banner sections | PNG screenshot + extracted text | Static image |
| CSS styling (colors, fonts) | -- | Lost (Notion applies its own) |
| Colored badges | `[badge text]` | Plain text |
| Side-by-side layouts | Sequential content | Stacked vertically |

## CLI Reference

```
html-to-notion convert <input> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <dir>` | Output directory | `./notion_export/` |
| `--no-screenshots` | Skip CSS component screenshots | `false` |
| `--no-mermaid-png` | Skip Mermaid PNG fallback rendering | `false` |
| `--viewport <width>` | Browser viewport width for screenshots | `1200` |
| `--mermaid-theme <name>` | Mermaid theme: default, neutral, dark, forest, base | `neutral` |
| `--no-zip` | Skip ZIP archive creation | `false` |
| `-v, --verbose` | Show detailed progress output | `false` |
| `-h, --help` | Show help | -- |

### Examples

```bash
# Basic conversion
npx html-to-notion convert report.html

# Custom output directory with wider viewport
npx html-to-notion convert dashboard.html -o ~/notion-import --viewport 1400

# Text-only conversion (no browser needed)
npx html-to-notion convert notes.html --no-screenshots --no-mermaid-png

# Convert without ZIP (just the output directory)
npx html-to-notion convert presentation.html -o output/ --no-zip

# Use dark theme for Mermaid diagrams with verbose logging
npx html-to-notion convert dashboard.html --mermaid-theme dark -v
```

## Architecture

```
                        html-to-notion convert input.html
                                     |
                                     v
                          +---------------------+
                          |   bin/html-to-notion |  CLI entry point (commander.js)
                          +---------------------+
                                     |
                                     v
                          +---------------------+
                          |   src/assembler.js   |  Orchestrator
                          +---------------------+
                            /        |        \
                           v         v         v
                +-----------+  +-----------+  +------------------+
                | converter  |  | screenshot|  | mermaid-renderer |
                |   .py      |  |   er.js   |  |       .js        |
                +-----------+  +-----------+  +------------------+
                      |              |                  |
                      v              v                  v
                  Markdown +     PNG images         PNG fallback
                  manifest +     of CSS visual      images of
                  .mmd files     components         Mermaid diagrams
                            \        |        /
                             v       v       v
                          +---------------------+
                          |   notion_import.zip  |
                          |   - document.md      |
                          |   - images/*.png     |
                          +---------------------+
```

## How It Works

### 1. Converter (`src/converter.py`)

Parses the input HTML with BeautifulSoup and walks the DOM tree. Each element type is detected by heuristic patterns (tag names, CSS classes, inline styles) and converted to the appropriate Markdown representation. Mermaid diagram source code is extracted to `.mmd` files. CSS-only visual components that cannot be represented in Markdown are registered in a screenshot manifest.

### 2. Screenshotter (`src/screenshotter.js`)

Opens the original HTML in a headless Chromium browser via Playwright. Reads the screenshot manifest and captures each registered CSS component (progress bars, stat cards, timelines, hero banners, comparison grids) as an individual PNG image.

### 3. Mermaid Renderer (`src/mermaid-renderer.js`)

Renders each extracted `.mmd` file to a PNG image using Mermaid.js loaded in a Playwright browser page. These serve as fallback images in case Notion's native Mermaid rendering is not configured.

### 4. Assembler (`src/assembler.js`)

Orchestrates the full pipeline: runs the converter, then the screenshotter and mermaid renderer, post-processes the Markdown to ensure image paths are correct, and bundles everything into a `notion_import.zip` ready for Notion import.

## Requirements

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Node.js | >= 18.0.0 | CLI and JavaScript pipeline |
| Python | >= 3.8 | HTML parsing and Markdown conversion |
| Playwright | ^1.50.0 | Headless browser for screenshots |
| beautifulsoup4 | >= 4.12.0 | HTML DOM parsing |
| commander | ^12.0.0 | CLI argument parsing |

### Installing Playwright Browsers

Playwright requires a Chromium browser binary. Install it after `npm install`:

```bash
npx playwright install chromium
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-change`
3. Make your changes and add tests in `test/`
4. Run the test suite: `npm test`
5. Submit a pull request

When adding support for new HTML element types:
- Add detection logic in `src/converter.py`
- Add a screenshot selector in `src/screenshotter.js` if the element is CSS-only
- Update the "What Gets Preserved" table in this README

## License

[MIT](LICENSE) -- Raz Petel, 2026

## Credits

Built with [Claude Code](https://claude.ai/code) by [Firmus AI](https://firmus.ai). Originally developed as an internal tool for converting rich HTML research notebooks into Notion documentation.
