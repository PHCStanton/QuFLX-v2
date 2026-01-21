import { getApiBaseUrl } from './apiBase';

export async function fetchDevLogsIndex() {
  const res = await fetch(`${getApiBaseUrl()}/api/v1/dev/logs/index`, { method: 'GET' });
  if (!res.ok) {
    const detail = await safeReadDetail(res);
    throw new Error(`Dev logs index failed: ${detail}`);
  }
  return res.json();
}

export async function fetchDevLogsState() {
  const res = await fetch(`${getApiBaseUrl()}/api/v1/dev/logs/state`, { method: 'GET' });
  if (!res.ok) {
    const detail = await safeReadDetail(res);
    throw new Error(`Dev logs state failed: ${detail}`);
  }
  return res.json();
}

export async function fetchDevLogTail({ service, file, lines = 200 }) {
  if (!service || !file) throw new Error('service and file are required');
  const url = new URL(`${getApiBaseUrl()}/api/v1/dev/logs/tail`);
  url.searchParams.set('service', service);
  url.searchParams.set('file', file);
  url.searchParams.set('lines', String(lines));

  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    const detail = await safeReadDetail(res);
    throw new Error(`Dev log tail failed: ${detail}`);
  }
  return res.json();
}

export async function setGatewayLogLevel(level) {
  const res = await fetch(`${getApiBaseUrl()}/api/v1/dev/logs/log-level`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level })
  });
  if (!res.ok) {
    const detail = await safeReadDetail(res);
    throw new Error(`Set log level failed: ${detail}`);
  }
  return res.json();
}

async function safeReadDetail(res) {
  try {
    const data = await res.json();
    if (data && typeof data.detail === 'string') return data.detail;
    if (data && typeof data.detail === 'object') return JSON.stringify(data.detail);
    return `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

