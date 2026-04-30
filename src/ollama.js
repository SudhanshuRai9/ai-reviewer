'use strict';

function ensureNoTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function postJson(url, body, { timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      const msg = `Ollama HTTP ${res.status}: ${text.slice(0, 500)}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

async function chat({ baseUrl, model, messages, options, timeoutMs }) {
  const url = `${ensureNoTrailingSlash(baseUrl)}/api/chat`;
  return postJson(
    url,
    {
      model,
      messages,
      stream: false,
      options: options || {}
    },
    { timeoutMs }
  );
}

module.exports = { chat };

