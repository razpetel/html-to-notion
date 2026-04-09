# Architecture

```
                        html-to-notion convert input.html
                                     |
                                     v
                          +---------------------+
                          | scripts/html-to-notion|  CLI entry point (commander.js)
                          +---------------------+
                                     |
                                     v
                          +---------------------+
                          | scripts/assembler.js |  Orchestrator
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

### 1. Converter (`scripts/converter.py`)

Parses the input HTML with BeautifulSoup and walks the DOM tree. Each element type is detected by heuristic patterns (tag names, CSS classes, inline styles) and converted to the appropriate Markdown representation. Mermaid diagram source code is extracted to `.mmd` files. CSS-only visual components that cannot be represented in Markdown are registered in a screenshot manifest.

### 2. Screenshotter (`scripts/screenshotter.js`)

Opens the original HTML in a headless Chromium browser via Playwright. Reads the screenshot manifest and captures each registered CSS component (progress bars, stat cards, timelines, hero banners, comparison grids) as an individual PNG image.

### 3. Mermaid Renderer (`scripts/mermaid-renderer.js`)

Renders each extracted `.mmd` file to a PNG image using Mermaid.js loaded in a Playwright browser page. These serve as fallback images in case Notion's native Mermaid rendering is not configured.

### 4. Assembler (`scripts/assembler.js`)

Orchestrates the full pipeline: runs the converter, then the screenshotter and mermaid renderer, post-processes the Markdown to ensure image paths are correct, and bundles everything into a `notion_import.zip` ready for Notion import.

## Requirements

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Node.js | >= 18.0.0 | CLI and JavaScript pipeline |
| Python | >= 3.8 | HTML parsing and Markdown conversion |
| Playwright | ^1.50.0 | Headless browser for screenshots |
| beautifulsoup4 | >= 4.12.0 | HTML DOM parsing |
| commander | ^12.0.0 | CLI argument parsing |

## Installing Playwright Browsers

Playwright requires a Chromium browser binary. Install it after `npm install`:

```bash
npx playwright install chromium
```
