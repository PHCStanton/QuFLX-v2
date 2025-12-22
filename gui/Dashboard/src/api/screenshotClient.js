export async function saveChartScreenshot({ imageBase64, annotated = false, asset, timeframe }) {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new Error('imageBase64 must be a non-empty string');
  }

  const payload = {
    image_base64: imageBase64,
    annotated: Boolean(annotated),
  };

  if (asset) {
    payload.asset = asset;
  }

  if (timeframe) {
    payload.timeframe = timeframe;
  }

  const res = await fetch('http://localhost:8000/api/v1/screenshots/chart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
    throw new Error(`Screenshot save failed: ${detail}`);
  }

  return res.json();
}
