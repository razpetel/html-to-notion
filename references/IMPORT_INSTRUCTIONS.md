# Notion Import Instructions

## Quick Import

1. Go to **Notion** → **Settings** → **Import** → **Markdown & CSV**
2. Upload the generated `notion_import.zip` file
3. A new page will be created with all content

## Post-Import Steps

### Mermaid Diagrams
After import, find each code block containing Mermaid syntax:
1. Click the code block
2. Change the language to **"Mermaid"**
3. Notion will render the diagram natively
4. If a diagram doesn't render, a PNG fallback image is included below the block

### Callout Boxes
Blockquotes with emoji prefixes can be converted to native Notion callouts:
1. Select the blockquote
2. Click **Turn into** → **Callout**
3. Set the icon to match the emoji prefix

### Emoji Mapping
| Emoji | Type | Notion Callout Color |
|-------|------|---------------------|
| 💡 | Insight/Info | Blue |
| ✅ | Success | Green |
| 🚨 | Danger/Error | Red |
| ⚠️ | Warning | Yellow |

## What's Preserved vs Lost

| Element | Status | Notes |
|---------|--------|-------|
| Text content | ✅ Preserved | All headings, paragraphs, lists |
| Mermaid diagrams | ✅ Native | Set code block language to "Mermaid" |
| Code blocks | ✅ Preserved | With syntax highlighting |
| Tables | ✅ Structure | Cell styling/colors lost |
| Callout boxes | ✅ Mapped | As blockquotes, convertible to callouts |
| CSS progress bars | 📷 Screenshot | Static image + text fallback |
| Stat card grids | 📷 Screenshot | Static image + table fallback |
| Timeline components | 📷 Screenshot | Static image + text fallback |
| Hero/banner sections | 📷 Screenshot | Static image |
| CSS styling | ❌ Lost | Fonts, colors, gradients, shadows |
| Colored badges | ❌ Lost | Preserved as [text] |
| Side-by-side layouts | ❌ Lost | Shown sequentially |
