#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const path = require('path');
const { convert } = require('./assembler');
const pkg = require('../package.json');

const program = new Command();

program
  .name('html-to-notion')
  .description(pkg.description)
  .version(pkg.version);

program
  .command('convert <input>')
  .description('Convert an HTML file to Notion-importable Markdown')
  .option('-o, --output <dir>', 'Output directory', './notion_export/')
  .option('--no-screenshots', 'Skip CSS component screenshots')
  .option('--no-mermaid-png', 'Skip Mermaid PNG fallback rendering')
  .option('--viewport <width>', 'Browser viewport width', '1200')
  .option('--mermaid-theme <name>', 'Mermaid theme', 'neutral')
  .option('--no-zip', 'Skip ZIP creation')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (input, opts) => {
    const inputPath = path.resolve(input);
    const outputDir = path.resolve(opts.output);

    const options = {
      input: inputPath,
      output: outputDir,
      screenshots: opts.screenshots,
      mermaidPng: opts.mermaidPng,
      viewport: parseInt(opts.viewport, 10),
      mermaidTheme: opts.mermaidTheme,
      zip: opts.zip,
      verbose: opts.verbose || false,
    };

    try {
      await convert(options);
    } catch (err) {
      console.error(`\nError: ${err.message}`);
      if (opts.verbose && err.stack) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  });

program.parse();
