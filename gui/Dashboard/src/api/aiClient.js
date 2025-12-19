export async function askAI({ prompt, context = {} }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt must be a non-empty string');
  }

  const res = await fetch('http://localhost:8000/api/v1/ai/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, context }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.detail) detail = data.detail;
    } catch {
      // ignore JSON parse errors and use generic detail
    }
    throw new Error(`AI request failed: ${detail}`);
  }

  return res.json();
}
