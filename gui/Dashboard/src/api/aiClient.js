import { getApiBaseUrl } from './apiBase';

export async function askAI({ prompt, context = {}, image = null }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt must be a non-empty string');
  }

  // Extract asset and timeframe from context to send as top-level params
  // Backend requires these as top-level for indicator injection
  const asset = context?.asset || null;
  const timeframe = context?.timeframe || null;

  const res = await fetch(`${getApiBaseUrl()}/api/v1/ai/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      context,
      image_base64: image,
      asset,
      timeframe,
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    let requestId = null;
    let code = null;
    try {
      const data = await res.json();
      if (data && typeof data.detail === 'string') detail = data.detail;
      if (data && typeof data.request_id === 'string') requestId = data.request_id;
      if (data && typeof data.code === 'string') code = data.code;
    } catch {
      // ignore JSON parse errors and use generic detail
    }

    const suffixParts = [];
    if (code) suffixParts.push(`code=${code}`);
    if (requestId) suffixParts.push(`req=${requestId}`);
    const suffix = suffixParts.length ? ` (${suffixParts.join(' ')})` : '';
    throw new Error(`AI request failed: ${detail}${suffix}`);
  }

  return res.json();
}
