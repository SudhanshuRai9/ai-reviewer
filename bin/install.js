#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { runReview } = require('../src/reviewer');
const { formatHelp, formatError, formatInfo, formatSuccess } = require('../src/formatter');

function findGitRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 50; i++) {
    const gitPath = path.join(dir, '.git');
    if (fs.existsSync(gitPath)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readHookTemplate() {
  const hookPath = path.join(__dirname, '..', 'hooks', 'pre-commit');
  return fs.readFileSync(hookPath, 'utf8');
}

function defaultConfigPath() {
  return path.join(__dirname, '..', '.ai-reviewer.json');
}

async function installHook({ force }) {
  const cwd = process.cwd();
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) throw new Error('Not inside a git repository (could not find .git).');

  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  const targetHook = path.join(hooksDir, 'pre-commit');
  const template = readHookTemplate();

  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  if (fs.existsSync(targetHook) && !force) {
    throw new Error(
      `A pre-commit hook already exists at ${targetHook}.\nRe-run with --force to overwrite.`
    );
  }

  fs.writeFileSync(targetHook, template, 'utf8');
  fs.chmodSync(targetHook, 0o755);

  const repoConfig = path.join(gitRoot, '.ai-reviewer.json');
  if (!fs.existsSync(repoConfig)) {
    fs.copyFileSync(defaultConfigPath(), repoConfig);
    process.stdout.write(formatInfo(`Created ${repoConfig}`));
    process.stdout.write('\n');
  } else {
    process.stdout.write(formatInfo(`Found existing ${repoConfig}`));
    process.stdout.write('\n');
  }

  process.stdout.write(formatSuccess(`Installed pre-commit hook at ${targetHook}`));
  process.stdout.write('\n');
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = new Set();
  const positionals = [];

  for (const token of rest) {
    if (token.startsWith('-')) flags.add(token);
    else positionals.push(token);
  }

  return { cmd: cmd || 'help', flags, positionals };
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(formatHelp());
    return;
  }

  if (cmd === 'install') {
    const force = flags.has('--force') || flags.has('-f');
    await installHook({ force });
    return;
  }

  if (cmd === 'run') {
    const isHook = flags.has('--hook');
    const exitCode = await runReview({ isHook });
    process.exitCode = exitCode;
    return;
  }

  process.stderr.write(formatError(`Unknown command: ${cmd}`));
  process.stderr.write('\n');
  process.stdout.write(formatHelp());
  process.exitCode = 2;
}

main().catch((err) => {
  const message = err && err.stack ? err.stack : String(err);
  process.stderr.write(formatError(message));
  process.stderr.write('\n');
  process.exitCode = 1;
});
