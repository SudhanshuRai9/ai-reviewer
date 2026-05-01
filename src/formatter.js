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

function colorizeDiffLine(line) {
  if (line.startsWith('diff --git ')) return c(ANSI.bold, line);
  if (line.startsWith('index ')) return c(ANSI.dim, line);
  if (line.startsWith('new file mode') || line.startsWith('deleted file mode')) return c(ANSI.dim, line);
  if (line.startsWith('--- ') || line.startsWith('+++ ')) return c(ANSI.dim, line);
  if (line.startsWith('@@')) return c(ANSI.cyan, line);
  if (line.startsWith('+') && !line.startsWith('+++')) return c(ANSI.green, line);
  if (line.startsWith('-') && !line.startsWith('---')) return c(ANSI.red, line);
  return line;
}

function normalizeIssue(issue) {
  return {
    severity: issue && issue.severity ? String(issue.severity).toLowerCase() : 'info',
    file: issue && issue.file ? String(issue.file) : null,
    line: issue && Number.isFinite(Number(issue.line)) ? Number(issue.line) : null,
    title: issue && (issue.title || issue.message) ? String(issue.title || issue.message) : 'Issue',
    details: issue && issue.details ? String(issue.details) : null,
    suggestion: issue && issue.suggestion ? String(issue.suggestion) : null
  };
}

function normalizeDiffPath(diffPath) {
  if (!diffPath) return null;
  // Typical unified diff paths are like "b/src/foo.js" or "a/src/foo.js"
  if (diffPath.startsWith('a/') || diffPath.startsWith('b/')) return diffPath.slice(2);
  return diffPath;
}

function buildIssueIndex(issues, { maxIssues }) {
  const out = new Map();
  const limited = issues.slice(0, maxIssues);
  for (const raw of limited) {
    const issue = normalizeIssue(raw);
    if (!issue.file) continue;
    const fileKey = normalizeDiffPath(issue.file);
    if (!fileKey) continue;
    if (!out.has(fileKey)) out.set(fileKey, []);
    out.get(fileKey).push(issue);
  }

  for (const [, list] of out) {
    list.sort((a, b) => (a.line || 0) - (b.line || 0));
  }

  return out;
}

function formatInlineIssue(issue) {
  const sev = (issue.severity || 'info').toLowerCase();
  const sevLabel = c(severityColor(sev), sev.toUpperCase());
  const reviewLabel = c(ANSI.bold, 'REVIEW');
  const base = `${reviewLabel} ${sevLabel}: ${issue.title}`;
  const detail = issue.details ? ` — ${issue.details}` : '';
  const fix = issue.suggestion ? ` ${c(ANSI.green, 'Fix:')} ${issue.suggestion}` : '';
  return `${c(ANSI.gray, '│')} ${base}${detail}${fix}`;
}

function formatAnnotatedDiff({ diff, issues, maxIssues }) {
  const issueIndex = buildIssueIndex(Array.isArray(issues) ? issues : [], { maxIssues });
  const lines = String(diff || '').split('\n');

  let currentFile = null;
  let currentNewLine = null;
  const pendingByLine = new Map(); // lineNo -> issues
  const unplacedForFile = new Map(); // file -> issues not placed by line

  function queueIssuesForFile(fileKey) {
    const list = issueIndex.get(fileKey) || [];
    if (!list.length) return;

    const byLine = new Map();
    const noLine = [];
    for (const issue of list) {
      if (issue.line) {
        if (!byLine.has(issue.line)) byLine.set(issue.line, []);
        byLine.get(issue.line).push(issue);
      } else {
        noLine.push(issue);
      }
    }
    for (const [ln, arr] of byLine) pendingByLine.set(ln, arr);
    if (noLine.length) unplacedForFile.set(fileKey, noLine);
  }

  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('+++ ')) {
      const filePath = line.slice(4).trim();
      currentFile = normalizeDiffPath(filePath.replace(/^\/dev\/null$/, '')) || null;
      currentNewLine = null;
      pendingByLine.clear();
      if (currentFile) queueIssuesForFile(currentFile);
      out += colorizeDiffLine(line) + '\n';

      // Attach file-level issues (no line) immediately after file header.
      if (currentFile && unplacedForFile.has(currentFile)) {
        for (const issue of unplacedForFile.get(currentFile)) {
          out += c(ANSI.yellow, formatInlineIssue(issue)) + '\n';
        }
        unplacedForFile.delete(currentFile);
      }
      continue;
    }

    if (line.startsWith('@@')) {
      // Parse @@ -oldStart,oldCount +newStart,newCount @@
      const m = /@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
      currentNewLine = m ? Number(m[1]) : null;
      out += colorizeDiffLine(line) + '\n';
      continue;
    }

    // Unified diff body line tracking
    if (currentNewLine != null) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        out += colorizeDiffLine(line) + '\n';
        const ln = currentNewLine;
        currentNewLine += 1;
        if (pendingByLine.has(ln)) {
          for (const issue of pendingByLine.get(ln)) out += c(ANSI.yellow, formatInlineIssue(issue)) + '\n';
          pendingByLine.delete(ln);
        }
        continue;
      }
      if (line.startsWith('-') && !line.startsWith('---')) {
        out += colorizeDiffLine(line) + '\n';
        continue;
      }
      // Context line (starts with space) or empty
      out += colorizeDiffLine(line) + '\n';
      if (line.startsWith(' ')) {
        const ln = currentNewLine;
        currentNewLine += 1;
        if (pendingByLine.has(ln)) {
          for (const issue of pendingByLine.get(ln)) out += c(ANSI.yellow, formatInlineIssue(issue)) + '\n';
          pendingByLine.delete(ln);
        }
      }
      continue;
    }

    out += colorizeDiffLine(line) + '\n';
  }

  // Note: issues that couldn't be placed by line are left out to avoid confusing placement.
  // They will still show in the normal issue list above.
  return out;
}

module.exports = {
  formatError,
  formatWarn,
  formatInfo,
  formatSuccess,
  formatReviewResult,
  formatAnnotatedDiff,
  formatHelp
};
