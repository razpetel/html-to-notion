'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Run the full HTML-to-Notion conversion pipeline.
 */
async function convert(options) {
  const {
    input,
    output,
    screenshots = true,
    mermaidPng = true,
    viewport = 1200,
    mermaidTheme = 'neutral',
    zip = true,
    verbose = false,
  } = options;

  const log = verbose ? (...args) => console.log('[html-to-notion]', ...args) : () => {};
  const stats = { steps: [], startTime: Date.now() };

  // Validate input
  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  // Ensure output directory exists
  fs.mkdirSync(output, { recursive: true });

  // --- Step 1: Run Python converter ---
  log('Running Markdown converter...');
  let converterResult;
  try {
    const cmd = `python3 ${quote(resolveScript('converter.py'))} ${quote(input)} -o ${quote(output)}`;
    log(`  $ ${cmd}`);
    const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    converterResult = JSON.parse(stdout);
    stats.steps.push('converter');
    log(`  Converter produced: ${converterResult.markdown_file || 'output'}`);
  } catch (err) {
    if (err.message && err.message.includes('python3')) {
      throw new Error(
        'Python 3 is required but was not found.\n' +
        'Install it from https://www.python.org/downloads/ or via your package manager:\n' +
        '  macOS:  brew install python3\n' +
        '  Ubuntu: sudo apt install python3\n' +
        '  Windows: winget install Python.Python.3'
      );
    }
    throw new Error(`Converter failed: ${err.message}`);
  }

  // --- Step 2: Screenshots (optional) ---
  if (screenshots) {
    const manifestPath = path.join(output, 'screenshot_manifest.json');
    if (fs.existsSync(manifestPath)) {
      log('Capturing CSS component screenshots...');
      const imagesDir = path.join(output, 'images');
      fs.mkdirSync(imagesDir, { recursive: true });
      try {
        const cmd = `node ${quote(resolveScript('screenshotter.js'))} --html ${quote(input)} --manifest ${quote(manifestPath)} --output ${quote(imagesDir)} --viewport ${viewport}`;
        log(`  $ ${cmd}`);
        execSync(cmd, { encoding: 'utf-8', stdio: verbose ? 'inherit' : 'pipe' });
        stats.steps.push('screenshots');
        log('  Screenshots captured.');
      } catch (err) {
        if (err.message && (err.message.includes('playwright') || err.message.includes('Playwright'))) {
          console.warn(
            '\nWarning: Playwright not installed. Screenshots skipped.\n' +
            'To enable screenshots, run: npx playwright install chromium\n'
          );
        } else {
          console.warn(`\nWarning: Screenshot capture failed: ${err.message}\n`);
        }
      }
    } else {
      log('  No screenshot manifest found, skipping screenshots.');
    }
  } else {
    log('Screenshots disabled, skipping.');
  }

  // --- Step 3: Mermaid PNG rendering (optional) ---
  if (mermaidPng) {
    const mermaidDir = path.join(output, 'mermaid_sources');
    if (fs.existsSync(mermaidDir) && fs.readdirSync(mermaidDir).length > 0) {
      log('Rendering Mermaid PNG fallbacks...');
      const imagesDir = path.join(output, 'images');
      fs.mkdirSync(imagesDir, { recursive: true });
      try {
        const cmd = `node ${quote(resolveScript('mermaid-renderer.js'))} --input ${quote(mermaidDir)} --output ${quote(imagesDir)} --theme ${mermaidTheme}`;
        log(`  $ ${cmd}`);
        execSync(cmd, { encoding: 'utf-8', stdio: verbose ? 'inherit' : 'pipe' });
        stats.steps.push('mermaid');
        log('  Mermaid PNGs rendered.');
      } catch (err) {
        if (err.message && (err.message.includes('playwright') || err.message.includes('Playwright'))) {
          console.warn(
            '\nWarning: Playwright not installed. Mermaid PNG rendering skipped.\n' +
            'To enable Mermaid rendering, run: npx playwright install chromium\n'
          );
        } else {
          console.warn(`\nWarning: Mermaid rendering failed: ${err.message}\n`);
        }
      }
    } else {
      log('  No Mermaid sources found, skipping PNG rendering.');
    }
  } else {
    log('Mermaid PNG rendering disabled, skipping.');
  }

  // --- Step 4: Post-process markdown — verify image references ---
  log('Verifying image references...');
  const mdFile = converterResult.markdown_file
    ? path.resolve(output, path.basename(converterResult.markdown_file))
    : findMarkdownFile(output);

  if (mdFile && fs.existsSync(mdFile)) {
    let md = fs.readFileSync(mdFile, 'utf-8');
    const imgPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let missingCount = 0;
    while ((match = imgPattern.exec(md)) !== null) {
      const imgRef = match[2];
      // Only check local references (not URLs)
      if (!imgRef.startsWith('http://') && !imgRef.startsWith('https://')) {
        const imgPath = path.resolve(path.dirname(mdFile), imgRef);
        if (!fs.existsSync(imgPath)) {
          missingCount++;
          if (verbose) {
            console.warn(`  Missing image: ${imgRef}`);
          }
        }
      }
    }
    if (missingCount > 0) {
      console.warn(`\nWarning: ${missingCount} image reference(s) point to missing files.`);
    } else {
      log('  All image references valid.');
    }
    stats.steps.push('verify-images');
  }

  // --- Step 5: Copy import instructions ---
  const instructionsSrc = path.join(__dirname, '..', 'templates', 'IMPORT_INSTRUCTIONS.md');
  if (fs.existsSync(instructionsSrc)) {
    const instructionsDst = path.join(output, 'IMPORT_INSTRUCTIONS.md');
    fs.copyFileSync(instructionsSrc, instructionsDst);
    stats.steps.push('import-instructions');
    log('Copied IMPORT_INSTRUCTIONS.md to output.');
  }

  // --- Step 6: Create ZIP (optional) ---
  if (zip) {
    log('Creating ZIP archive...');
    const zipPath = path.join(path.dirname(output), 'notion_import.zip');
    try {
      // Try using archiver if available, fall back to shell zip
      await createZip(output, zipPath);
      stats.steps.push('zip');
      log(`  Created: ${zipPath}`);
    } catch (err) {
      console.warn(`\nWarning: ZIP creation failed: ${err.message}`);
      console.warn('You can manually zip the output directory for Notion import.\n');
    }
  } else {
    log('ZIP creation disabled, skipping.');
  }

  // --- Summary ---
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log('\n=== html-to-notion conversion complete ===');
  console.log(`  Input:    ${path.basename(input)}`);
  console.log(`  Output:   ${output}`);
  console.log(`  Steps:    ${stats.steps.join(' → ') || 'none'}`);
  console.log(`  Time:     ${elapsed}s`);
  if (zip && stats.steps.includes('zip')) {
    console.log(`  ZIP:      ${path.join(path.dirname(output), 'notion_import.zip')}`);
  }
  console.log('\nSee IMPORT_INSTRUCTIONS.md in the output folder for Notion import steps.');

  return { stats, converterResult };
}

// --- Helpers ---

function resolveScript(name) {
  return path.join(__dirname, name);
}

function quote(s) {
  // Shell-escape a path argument
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function findMarkdownFile(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'IMPORT_INSTRUCTIONS.md');
  if (files.length === 0) return null;
  return path.join(dir, files[0]);
}

async function createZip(sourceDir, zipPath) {
  try {
    // Try archiver first (npm package)
    const archiver = require('archiver');
    return new Promise((resolve, reject) => {
      const out = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      out.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(out);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  } catch (_) {
    // Fall back to shell zip
    execSync(`zip -r -j ${quote(zipPath)} ${quote(sourceDir)}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  }
}

module.exports = { convert };
