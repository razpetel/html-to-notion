# html-to-notion

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

# Quick start: convert an HTML file
node scripts/html-to-notion.js convert my-report.html -o output/
```

For CLI reference and detailed usage, see [SKILL.md](SKILL.md). For architecture details, see [references/ARCHITECTURE.md](references/ARCHITECTURE.md).

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

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-change`
3. Make your changes and add tests in `test/`
4. Run the test suite: `npm test`
5. Submit a pull request

When adding support for new HTML element types:
- Add detection logic in `scripts/converter.py`
- Add a screenshot selector in `scripts/screenshotter.js` if the element is CSS-only
- Update the "What Gets Preserved" table in this README

## License

[MIT](LICENSE) -- Raz Petel, 2026

## Credits

Built with [Claude Code](https://claude.ai/code) by [Firmus AI](https://firmus.ai). Originally developed as an internal tool for converting rich HTML research notebooks into Notion documentation.
