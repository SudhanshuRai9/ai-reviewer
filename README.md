# ai-reviewer

Local AI code reviewer that runs **inside your terminal** on every `git commit`.

It uses **Ollama** (local LLM) and reviews the **staged diff** (`git diff --cached`) before the commit lands.

## Why

- Code review is async and slow; solo projects often skip it.
- Small teams bottleneck on a senior dev.
- Many companies ban cloud AI tools on proprietary code.

`ai-reviewer` runs entirely on your machine, in ~5–10 seconds, and costs nothing (beyond local compute).

## Prereqs

- Node.js >= 18
- Git
- Ollama running locally and a model pulled (example):
  - `ollama serve`
  - `ollama pull llama3.1`

## Install (git hook)

In the repo you want to protect:

```bash
npm i -D ai-reviewer
npx ai-reviewer install
```

This installs a `pre-commit` hook at `.git/hooks/pre-commit`.

## Config

`ai-reviewer` loads config from:

1. Package defaults (this repo’s `.ai-reviewer.json`)
2. Your repo’s `.ai-reviewer.json` (if present)

If your repo doesn’t have a config yet, `install` will offer a starter `.ai-reviewer.json` by copying the defaults.

Common tweaks:

- Set your model:
  - `"ollama": { "model": "qwen2.5-coder:7b" }`
- Add team rules:
  - `"rules": ["Always check for SQL injection", "Enforce our error handling pattern"]`
- Block commits only on severe findings:
  - `"behavior": { "blockOnSeverities": ["high"] }`

## Usage

- Manual run (reviews staged changes):
  - `npx ai-reviewer run`
- Skip once:
  - `AI_REVIEWER_SKIP=1 git commit -m "wip"`
- Skip hooks entirely:
  - `git commit --no-verify`

## Output

The tool prints:

- A short summary
- A list of issues (severity: high/medium/low/info)
- Concrete suggestions

If any issue matches `behavior.blockOnSeverities`, the hook exits non‑zero and blocks the commit.

