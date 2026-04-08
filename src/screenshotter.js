#!/usr/bin/env node
/**
 * screenshotter.js - Capture visual components from an HTML report as PNGs.
 *
 * Reads a screenshot_manifest.json to know what to capture, auto-detects
 * elements by type using CSS selectors, and saves individual screenshots
 * plus a full-page reference image.
 *
 * Usage:
 *   node screenshotter.js --html <path> --manifest <path> --output <dir> [--viewport <width>]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { viewport: 1200 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--html':     args.html     = argv[++i]; break;
      case '--manifest': args.manifest = argv[++i]; break;
      case '--output':   args.output   = argv[++i]; break;
      case '--viewport': args.viewport = parseInt(argv[++i], 10); break;
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
Usage: node screenshotter.js --html <path> --manifest <path> --output <dir> [--viewport <width>]

Options:
  --html      Path to the HTML file to screenshot (required)
  --manifest  Path to screenshot_manifest.json (required)
  --output    Output directory for screenshots (required)
  --viewport  Viewport width in pixels (default: 1200)
  --help      Show this help message
`);
}

// ---------------------------------------------------------------------------
// Selectors by component type
// ---------------------------------------------------------------------------
const CLASS_SELECTORS = {
  hero:         ['header', '.hero', '[class*="hero"]'],
  stat_cards:   ['.stats-row', '.stat-cards', '[class*="stats"]'],
  progress_bar: ['.progress-bar', '.progress', '[class*="progress"]'],
  timeline:     ['.timeline', '[class*="timeline"]'],
  mermaid:      ['.mermaid-wrapper', '.mermaid', 'pre.mermaid'],
  comparison:   ['div[style*="grid-template-columns"]:not(.stats-row)'],
};

/**
 * Collect all elements grouped by manifest type.
 * Class-based types use CSS selectors; visual_component uses JS evaluation.
 */
async function collectElements(page) {
  const elementsByType = {};

  for (const [type, selectors] of Object.entries(CLASS_SELECTORS)) {
    const combined = selectors.join(', ');
    elementsByType[type] = await page.$$(combined);
  }

  // visual_component: styled card divs containing tables, not nested in grids
  const vcHandles = await page.evaluateHandle(() => {
    const candidates = document.querySelectorAll(
      'div[style*="border"][style*="border-radius"][style*="padding"]'
    );
    return Array.from(candidates).filter(el => {
      if (!el.querySelector('table')) return false;
      let parent = el.parentElement;
      while (parent) {
        const ps = parent.getAttribute('style') || '';
        if (ps.includes('grid-template-columns')) return false;
        parent = parent.parentElement;
      }
      return true;
    });
  });
  const vcCount = await vcHandles.evaluate(arr => arr.length);
  elementsByType.visual_component = [];
  for (let i = 0; i < vcCount; i++) {
    const eh = await vcHandles.evaluateHandle((arr, idx) => arr[idx], i);
    elementsByType.visual_component.push(eh.asElement());
  }

  return elementsByType;
}

/**
 * Detect whether the page includes a Mermaid.js script and wait for rendering.
 */
async function waitForMermaid(page) {
  const hasMermaid = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    return scripts.some(s => s.src.includes('mermaid'));
  });
  if (hasMermaid) {
    await page.waitForTimeout(3000);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);

  if (!args.html || !args.manifest || !args.output) {
    console.error('Error: --html, --manifest, and --output are required.');
    printUsage();
    process.exit(1);
  }

  const htmlPath     = path.resolve(args.html);
  const manifestPath = path.resolve(args.manifest);
  const outputDir    = path.resolve(args.output);

  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML file not found: ${htmlPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest file not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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

  const page = await browser.newPage({
    viewport: { width: args.viewport, height: 900 },
  });

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await waitForMermaid(page);

  const elementsByType = await collectElements(page);

  // Log discovered element counts
  for (const [type, els] of Object.entries(elementsByType)) {
    console.error(`  Found ${els.length} ${type} element(s)`);
  }

  // Process manifest items
  const typeCounters = {};
  let successCount = 0;
  let failCount = 0;
  const files = [];

  for (const item of manifest) {
    const type = item.type;
    typeCounters[type] = (typeCounters[type] || 0) + 1;
    const idx = typeCounters[type];

    const elements = elementsByType[type];
    if (!elements || elements.length === 0) {
      console.error(`Warning: No elements for type "${type}", skipping ${item.filename}`);
      failCount++;
      continue;
    }

    const el = elements[idx - 1];
    if (!el) {
      console.error(`Warning: ${type} #${idx} not found (${elements.length} available), skipping ${item.filename}`);
      failCount++;
      continue;
    }

    try {
      const outPath = path.join(outputDir, item.filename);
      await el.screenshot({ path: outPath, type: 'png' });
      files.push(outPath);
      successCount++;
    } catch (err) {
      console.error(`Failed to screenshot ${item.filename}: ${err.message}`);
      failCount++;
    }
  }

  // Full-page reference screenshot
  const fullPagePath = path.join(outputDir, 'full_page.png');
  await page.screenshot({ path: fullPagePath, fullPage: true });
  files.push(fullPagePath);

  await browser.close();

  const result = { success: successCount, failed: failCount, files };
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
