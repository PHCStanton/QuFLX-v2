import { getApiBaseUrl } from './apiBase';

const buildAiRequestError = ({ detail, status, code = null, requestId = null, retryable = null }) => {
  const err = new Error(`AI request failed: ${detail}`);
  err.name = 'AiRequestError';
  err.status = status;
  err.code = code;
  err.requestId = requestId;
  err.retryable = retryable;
  return err;
};

const buildRequestBody = ({ prompt, model, context = {}, image = null }) => {
  const asset = context?.asset || null;
  const timeframe = context?.timeframe || null;

  const body = {
    prompt,
    context,
    image_base64: image,
    asset,
    timeframe,
  };
  if (model != null) {
    body.model = model;
  }
  return body;
};

const throwAiErrorResponse = async (res, logLabel) => {
  let detail = `HTTP ${res.status}`;
  let requestId = null;
  let code = null;
  let retryable = null;
  try {
    const data = await res.json();
    if (data && typeof data.detail === 'string') detail = data.detail;
    if (data && typeof data.request_id === 'string') requestId = data.request_id;
    if (data && typeof data.code === 'string') code = data.code;
    if (data && typeof data.retryable === 'boolean') retryable = data.retryable;
  } catch (parseError) {
    console.warn(`${logLabel}: failed to parse error response JSON`, parseError);
  }

  throw buildAiRequestError({
    detail,
    status: res.status,
    code,
    requestId,
    retryable,
  });
};

export async function askAI({ prompt, model, context = {}, image = null, signal = null }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt must be a non-empty string');
  }

  const body = buildRequestBody({ prompt, model, context, image });

  const res = await fetch(`${getApiBaseUrl()}/api/v1/ai/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    await throwAiErrorResponse(res, 'askAI');
  }

  return res.json();
}

export async function* askAIStream({ prompt, model, context = {}, image = null, signal = null }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt must be a non-empty string');
  }

  const body = buildRequestBody({ prompt, model, context, image });
  const res = await fetch(`${getApiBaseUrl()}/api/v1/ai/ask/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    await throwAiErrorResponse(res, 'askAIStream');
  }

  if (!res.body) {
    throw new Error('AI stream response body is missing.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLine = event
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('data:'));

      if (!dataLine) {
        continue;
      }

      const data = dataLine.slice(5).trim();
      if (!data || data === '[DONE]') {
        return;
      }

      const chunk = JSON.parse(data);
      if (chunk?.type === 'error') {
        throw buildAiRequestError({
          detail: chunk.detail || 'AI stream failed.',
          status: 502,
          code: chunk.code || null,
          requestId: chunk.request_id || null,
          retryable: typeof chunk.retryable === 'boolean' ? chunk.retryable : null,
        });
      }

      yield chunk;
    }
  }
}
