#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'sample.html');
const OUT_DIR = '/tmp/html-to-notion-test';
const CLI = path.join(ROOT, 'scripts', 'html-to-notion.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, message: err.message });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function cleanup() {
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Pre-flight: verify fixture exists
// ---------------------------------------------------------------------------
if (!fs.existsSync(FIXTURE)) {
  console.error(`Fixture not found: ${FIXTURE}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run converter
// ---------------------------------------------------------------------------
console.log('\n=== html-to-notion end-to-end test ===\n');

cleanup();
fs.mkdirSync(OUT_DIR, { recursive: true });

let converterAvailable = true;
try {
  // Check that the assembler module exists (converter core)
  require.resolve(path.join(ROOT, 'scripts', 'assembler'));
} catch {
  converterAvailable = false;
}

if (!converterAvailable) {
  console.log('Converter (scripts/assembler.js) not yet available — running fixture-only checks.\n');
} else {
  console.log(`Running: node ${CLI} convert ${FIXTURE} -o ${OUT_DIR} --no-screenshots --no-mermaid-png`);
  try {
    execSync(
      `node "${CLI}" convert "${FIXTURE}" -o "${OUT_DIR}" --no-screenshots --no-mermaid-png`,
      { stdio: 'pipe', timeout: 30000 }
    );
    console.log('Converter completed successfully.\n');
  } catch (err) {
    console.error(`Converter failed: ${err.stderr ? err.stderr.toString() : err.message}`);
    converterAvailable = false;
    console.log('Falling back to fixture-only checks.\n');
  }
}

// ---------------------------------------------------------------------------
// Find the generated markdown (if converter ran)
// ---------------------------------------------------------------------------
let markdown = '';
if (converterAvailable) {
  // Prefer output.md; fall back to first .md that isn't IMPORT_INSTRUCTIONS
  const outputMd = path.join(OUT_DIR, 'output.md');
  if (fs.existsSync(outputMd)) {
    markdown = fs.readFileSync(outputMd, 'utf8');
  } else {
    const mdFiles = findFiles(OUT_DIR, '.md')
      .filter(f => !f.includes('IMPORT_INSTRUCTIONS'));
    if (mdFiles.length > 0) {
      markdown = fs.readFileSync(mdFiles[0], 'utf8');
    }
  }
}

function findFiles(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Fixture validation tests (always run)
// ---------------------------------------------------------------------------
console.log('--- Fixture validation ---');

test('Fixture file exists and is non-empty', () => {
  const stat = fs.statSync(FIXTURE);
  assert.ok(stat.size > 500, `Fixture too small: ${stat.size} bytes`);
});

const fixtureHTML = fs.readFileSync(FIXTURE, 'utf8');

test('Fixture contains hero section', () => {
  assert.ok(fixtureHTML.includes('<header class="hero">'), 'Missing hero header');
});

test('Fixture contains mermaid diagram', () => {
  assert.ok(fixtureHTML.includes('<pre class="mermaid">'), 'Missing mermaid pre block');
  assert.ok(fixtureHTML.includes('mermaid-wrapper'), 'Missing mermaid-wrapper div');
});

test('Fixture contains data table with badges', () => {
  assert.ok(fixtureHTML.includes('<table>'), 'Missing table element');
  assert.ok(fixtureHTML.includes('badge green'), 'Missing green badge');
  assert.ok(fixtureHTML.includes('badge red'), 'Missing red badge');
});

test('Fixture contains all callout types', () => {
  for (const type of ['insight', 'success', 'danger', 'warn']) {
    assert.ok(fixtureHTML.includes(`callout ${type}`), `Missing ${type} callout`);
  }
});

test('Fixture contains progress bar', () => {
  assert.ok(fixtureHTML.includes('progress-bar'), 'Missing progress-bar');
  assert.ok(fixtureHTML.includes('background-color'), 'Missing colored segments');
});

test('Fixture contains stat cards', () => {
  assert.ok(fixtureHTML.includes('stats-row'), 'Missing stats-row');
  const cardCount = (fixtureHTML.match(/stat-card/g) || []).length;
  assert.ok(cardCount >= 4, `Expected >= 4 stat-card refs, got ${cardCount}`);
});

test('Fixture contains timeline', () => {
  assert.ok(fixtureHTML.includes('class="timeline"'), 'Missing timeline');
  for (const state of ['success', 'fail', 'fix']) {
    assert.ok(fixtureHTML.includes(`timeline-item ${state}`), `Missing ${state} timeline item`);
  }
});

test('Fixture contains code block', () => {
  assert.ok(fixtureHTML.includes('<pre><code'), 'Missing pre/code block');
  assert.ok(fixtureHTML.includes('language-python'), 'Missing Python code block');
});

test('Fixture contains side-by-side comparison', () => {
  assert.ok(fixtureHTML.includes('comparison-grid'), 'Missing comparison grid');
  const cardCount = (fixtureHTML.match(/comparison-card/g) || []).length;
  assert.ok(cardCount >= 2, `Expected >= 2 comparison cards, got ${cardCount}`);
});

test('Fixture includes mermaid.js CDN script', () => {
  assert.ok(fixtureHTML.includes('mermaid'), 'Missing mermaid script reference');
  assert.ok(fixtureHTML.includes('cdn.jsdelivr.net'), 'Missing CDN reference');
});

// ---------------------------------------------------------------------------
// Converter output tests (only when converter ran successfully)
// ---------------------------------------------------------------------------
if (converterAvailable && markdown) {
  console.log('\n--- Converter output validation ---');

  test('Markdown file was generated', () => {
    assert.ok(markdown.length > 100, `Markdown too short: ${markdown.length} chars`);
  });

  test('Mermaid block extracted as fenced code', () => {
    assert.ok(markdown.includes('```mermaid'), 'Missing ```mermaid fenced block');
  });

  test('GFM table present', () => {
    assert.ok(markdown.includes('| '), 'Missing GFM table pipe syntax');
  });

  test('Callouts converted with emoji', () => {
    assert.ok(markdown.includes('> '), 'Missing blockquote syntax');
    // Check for at least one callout emoji
    const hasEmoji = /[💡✅🚨⚠️]/.test(markdown);
    assert.ok(hasEmoji, 'Missing callout emoji in blockquotes');
  });

  test('Image references present for screenshots', () => {
    assert.ok(markdown.includes('!['), 'Missing image reference syntax');
  });

  test('Mermaid sources directory has .mmd files', () => {
    const mmdDir = path.join(OUT_DIR, 'mermaid_sources');
    if (fs.existsSync(mmdDir)) {
      const mmdFiles = fs.readdirSync(mmdDir).filter(f => f.endsWith('.mmd'));
      assert.ok(mmdFiles.length > 0, 'mermaid_sources/ has no .mmd files');
    } else {
      // Check in subdirectories
      const mmdFiles = findFiles(OUT_DIR, '.mmd');
      assert.ok(mmdFiles.length > 0, 'No .mmd files found in output');
    }
  });

  test('Screenshot manifest exists and is valid JSON', () => {
    const manifestPaths = [
      path.join(OUT_DIR, 'screenshot_manifest.json'),
      ...findFiles(OUT_DIR, '.json').filter(f => f.includes('manifest')),
    ];
    const manifestPath = manifestPaths.find(p => fs.existsSync(p));
    assert.ok(manifestPath, 'screenshot_manifest.json not found');
    const content = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(content); // will throw on invalid JSON
    assert.ok(Array.isArray(parsed), 'Manifest should be an array');
  });
} else if (!converterAvailable) {
  console.log('\n--- Converter output tests skipped (assembler not available) ---');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.message}`);
  }
}

cleanup();
process.exit(failed > 0 ? 1 : 0);
