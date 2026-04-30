'use strict';

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  gray: '\u001b[90m'
};

function c(color, text) {
  return `${color}${text}${ANSI.reset}`;
}

function formatError(text) {
  return c(ANSI.red, `ai-reviewer: ${text}`);
}

function formatWarn(text) {
  return c(ANSI.yellow, `ai-reviewer: ${text}`);
}

function formatInfo(text) {
  return c(ANSI.cyan, `ai-reviewer: ${text}`);
}

function formatSuccess(text) {
  return c(ANSI.green, `ai-reviewer: ${text}`);
}

function severityColor(sev) {
  switch ((sev || '').toLowerCase()) {
    case 'high':
      return ANSI.red;
    case 'medium':
      return ANSI.yellow;
    case 'low':
      return ANSI.cyan;
    default:
      return ANSI.gray;
  }
}

function formatIssue(issue, index) {
  const sev = (issue.severity || 'info').toLowerCase();
  const sevLabel = c(severityColor(sev), sev.toUpperCase().padEnd(6));
  const where = [issue.file, issue.line ? `:${issue.line}` : ''].join('');
  const title = issue.title || issue.message || 'Issue';

  let out = `${sevLabel} ${index + 1}. ${title}`;
  if (where.trim()) out += ` ${c(ANSI.gray, `(${where})`)}`;
  out += '\n';
  if (issue.details) out += `    ${issue.details}\n`;
  if (issue.suggestion) out += `    ${c(ANSI.green, 'Fix:')} ${issue.suggestion}\n`;
  return out;
}

function formatReviewResult(result) {
  const issues = Array.isArray(result.issues) ? result.issues : [];
  let out = '';

  const header = result.overall ? String(result.overall).toUpperCase() : issues.length ? 'WARN' : 'OK';
  const headerColor = header === 'BLOCK' ? ANSI.red : header === 'WARN' ? ANSI.yellow : ANSI.green;
  out += `${c(headerColor, `${ANSI.bold}${header}${ANSI.reset}`)} ${result.summary ? `- ${result.summary}` : ''}\n`;

  if (!issues.length) {
    out += c(ANSI.green, 'No issues found in staged changes.') + '\n';
    return out;
  }

  for (let i = 0; i < issues.length; i++) {
    out += formatIssue(issues[i], i);
  }

  return out;
}

function formatHelp() {
  return [
    'ai-reviewer - local AI code reviewer (Ollama) for git pre-commit',
    '',
    'Usage:',
    '  ai-reviewer install [--force]    Install .git/hooks/pre-commit',
    '  ai-reviewer run [--hook]         Review staged diff',
    '',
    'Env:',
    '  OLLAMA_HOST=http://localhost:11434',
    '  OLLAMA_MODEL=llama3.1',
    '  AI_REVIEWER_SKIP=1               Skip review (hook + manual)',
    ''
  ].join('\n');
}

module.exports = {
  formatError,
  formatWarn,
  formatInfo,
  formatSuccess,
  formatReviewResult,
  formatHelp
};

