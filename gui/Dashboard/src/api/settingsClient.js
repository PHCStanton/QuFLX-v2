import { getApiBaseUrl } from './apiBase';

export async function fetchSettings() {
  const res = await fetch(`${getApiBaseUrl()}/api/v1/settings`, {
    method: 'GET'
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.detail) {
        detail = data.detail;
      }
    } catch (parseError) {
      void parseError;
    }
    throw new Error(`Fetch settings failed: ${detail}`);
  }

  return res.json();
}

export async function updateSettings(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('payload must be an object');
  }

  const res = await fetch(`${getApiBaseUrl()}/api/v1/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.detail) {
        detail = data.detail;
      }
    } catch (parseError) {
      void parseError;
    }
    throw new Error(`Update settings failed: ${detail}`);
  }

  return res.json();
}
