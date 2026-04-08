#!/usr/bin/env node
/**
 * mermaid-renderer.js - Render .mmd Mermaid diagram files to PNG images.
 *
 * Reads all .mmd files from an input directory, renders each via Playwright
 * with the Mermaid.js CDN, and saves PNGs to the output directory.
 *
 * Usage:
 *   node mermaid-renderer.js --input <dir> --output <dir> [--theme <name>] [--viewport <width>]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { theme: 'neutral', viewport: 1200 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--input':    args.input    = argv[++i]; break;
      case '--output':   args.output   = argv[++i]; break;
      case '--theme':    args.theme    = argv[++i]; break;
      case '--viewport': {
        const v = parseInt(argv[++i], 10);
        if (isNaN(v) || v <= 0) { console.error('--viewport must be a positive integer'); process.exit(1); }
        args.viewport = v;
        break;
      }
      case '--help': case '-h':
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        printUsage();
        process.exit(1);
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Usage: node mermaid-renderer.js --input <dir> --output <dir> [--theme <name>] [--viewport <width>]

Options:
  --input     Directory containing .mmd files (required)
  --output    Output directory for rendered PNGs (required)
  --theme     Mermaid theme: default, neutral, dark, forest, base (default: neutral)
  --viewport  Viewport width in pixels (default: 1200)
  --help      Show this help message
`);
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const VALID_THEMES = ['default', 'neutral', 'dark', 'forest', 'base'];

function validateTheme(theme) {
  if (!VALID_THEMES.includes(theme)) {
    console.error(`Invalid theme: "${theme}". Valid themes: ${VALID_THEMES.join(', ')}`);
    process.exit(1);
  }
  return theme;
}

function buildHtml(mmdSource, theme) {
  const safeTheme = validateTheme(theme);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: white;
      display: flex;
      justify-content: center;
    }
    #container {
      display: inline-block;
    }
  </style>
</head>
<body>
  <div id="container">
    <pre class="mermaid">${escapeHtml(mmdSource)}</pre>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: '${safeTheme}',
      flowchart: { useMaxWidth: false },
      sequence: { useMaxWidth: false }
    });
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);

  if (!args.input || !args.output) {
    console.error('Error: --input and --output are required.');
    printUsage();
    process.exit(1);
  }

  const inputDir  = path.resolve(args.input);
  const outputDir = path.resolve(args.output);

  if (!fs.existsSync(inputDir)) {
    console.error(`Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  const mmdFiles = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.mmd'))
    .sort();

  if (mmdFiles.length === 0) {
    console.error(`No .mmd files found in ${inputDir}`);
    const result = { rendered: 0, failed: 0, files: [] };
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    console.error(
      'Failed to launch browser. Ensure Playwright browsers are installed:\n' +
      '  npx playwright install chromium\n\n' +
      err.message
    );
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: args.viewport, height: 800 },
  });

  let rendered = 0;
  let failed = 0;
  const files = [];

  for (let i = 0; i < mmdFiles.length; i++) {
    const mmdFile = mmdFiles[i];
    const baseName = path.basename(mmdFile, '.mmd');
    const mmdPath = path.join(inputDir, mmdFile);
    const pngName = `mermaid_${String(i + 1).padStart(2, '0')}.png`;
    const pngPath = path.join(outputDir, pngName);

    const mmdSource = fs.readFileSync(mmdPath, 'utf-8');
    console.error(`Rendering ${mmdFile} -> ${pngName}...`);

    const page = await context.newPage();
    const html = buildHtml(mmdSource, args.theme);

    try {
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.waitForSelector('#container svg', { timeout: 15000 });
      await page.waitForTimeout(2000);

      const svgElement = await page.$('#container svg');
      if (svgElement) {
        await svgElement.screenshot({ path: pngPath, omitBackground: false });
        files.push(pngPath);
        rendered++;
      } else {
        console.error(`  No SVG found for ${mmdFile}`);
        failed++;
      }
    } catch (err) {
      console.error(`  Failed to render ${mmdFile}: ${err.message}`);
      failed++;
    }

    await page.close();
  }

  await browser.close();

  const result = { rendered, failed, files };
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
