'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const { loadConfig } = require('./config');
const { chat } = require('./ollama');
const { formatWarn, formatReviewResult } = require('./formatter');

function findGitRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 50; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function git(args, { cwd }) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function getStagedDiff(repoRoot) {
  return git(['diff', '--cached', '--no-color'], { cwd: repoRoot });
}

function getStagedNameStatus(repoRoot) {
  try {
    return git(['diff', '--cached', '--name-status'], { cwd: repoRoot });
  } catch {
    return '';
  }
}

function buildPrompt({ config, nameStatus, diff, truncated }) {
  const rules = Array.isArray(config.rules) ? config.rules : [];
  const system = (config.prompt && config.prompt.system) || '';

  const instruction = [
    'Return ONLY a JSON object with this exact shape (no markdown, no code fences):',
    '{',
    '  "summary": string,',
    '  "overall": "OK" | "WARN" | "BLOCK",',
    '  "issues": [',
    '    {',
    '      "severity": "high" | "medium" | "low" | "info",',
    '      "file": string | null,',
    '      "line": number | null,',
    '      "title": string,',
    '      "details": string | null,',
    '      "suggestion": string | null',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    ...rules.map((r) => `- ${r}`),
    '',
    truncated ? 'NOTE: The diff was truncated due to size; be cautious.' : '',
    '',
    'Staged files (name-status):',
    nameStatus || '(unavailable)',
    '',
    'Staged diff:',
    diff
  ]
    .filter(Boolean)
    .join('\n');

  return {
    system,
    user: instruction
  };
}

function shouldBlock({ issues, blockOnSeverities }) {
  const blockSet = new Set((blockOnSeverities || []).map((s) => String(s).toLowerCase()));
  for (const issue of issues) {
    const sev = String(issue.severity || 'info').toLowerCase();
    if (blockSet.has(sev)) return true;
  }
  return false;
}

async function runReview({ isHook }) {
  if (process.env.AI_REVIEWER_SKIP === '1') return 0;

  const repoRoot = findGitRoot(process.cwd());
  if (!repoRoot) {
    process.stderr.write(formatWarn('Not in a git repo. Skipping.'));
    process.stderr.write('\n');
    return 0;
  }

  const { config } = loadConfig({ repoRoot });

  let diff = '';
  try {
    diff = getStagedDiff(repoRoot);
  } catch (e) {
    process.stderr.write(formatWarn('Failed to read staged diff. Skipping.'));
    process.stderr.write('\n');
    return 0;
  }

  if (!diff.trim()) return 0;

  const maxDiffChars = Number(config.review && config.review.maxDiffChars) || 18000;
  let truncated = false;
  if (diff.length > maxDiffChars) {
    diff = diff.slice(0, maxDiffChars) + '\n\n[...diff truncated...]\n';
    truncated = true;
  }

  const nameStatus = getStagedNameStatus(repoRoot).trim();
  const prompt = buildPrompt({ config, nameStatus, diff, truncated });

  const baseUrl = (config.ollama && config.ollama.baseUrl) || 'http://localhost:11434';
  const model = (config.ollama && config.ollama.model) || 'llama3.1';
  const timeoutMs = Number(config.ollama && config.ollama.timeoutMs) || 12000;
  const temperature = Number(config.review && config.review.temperature);
  const maxTokens = Number(config.review && config.review.maxTokens);

  let response;
  try {
    response = await chat({
      baseUrl,
      model,
      timeoutMs,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ],
      options: {
        ...(Number.isFinite(temperature) ? { temperature } : {}),
        ...(Number.isFinite(maxTokens) ? { num_predict: maxTokens } : {})
      }
    });
  } catch (e) {
    const blockOnOllamaDown = Boolean(config.behavior && config.behavior.blockOnOllamaDown);
    process.stderr.write(formatWarn(`Ollama unavailable or request failed (${e.message}).`));
    process.stderr.write('\n');
    return blockOnOllamaDown ? 1 : 0;
  }

  const content = response && response.message && response.message.content ? response.message.content : '';
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const blockOnInvalidJson = Boolean(config.behavior && config.behavior.blockOnInvalidJson);
    process.stderr.write(formatWarn('Model did not return valid JSON.'));
    process.stderr.write('\n');
    if (config.behavior && config.behavior.printModelResponseOnInvalidJson) {
      process.stdout.write(content);
      if (!content.endsWith('\n')) process.stdout.write('\n');
    }
    return blockOnInvalidJson ? 1 : 0;
  }

  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];

  const block = shouldBlock({
    issues,
    blockOnSeverities: config.behavior && config.behavior.blockOnSeverities
  });

  const result = {
    summary: parsed.summary || '',
    overall: block ? 'BLOCK' : issues.length ? 'WARN' : 'OK',
    issues
  };

  process.stdout.write(formatReviewResult(result));

  return block ? 1 : 0;
}

module.exports = { runReview };
