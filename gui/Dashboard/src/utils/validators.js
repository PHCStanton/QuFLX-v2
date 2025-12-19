
export const validateMarketData = (data) => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid payload' };
  }

  const assetKey = data?.asset;
  if (!assetKey) {
    return { valid: false, error: 'Missing asset' };
  }

  const rawPrice = data?.price ?? data?.close ?? data?.open;
  const price = Number(rawPrice);
  
  if (!Number.isFinite(price)) {
    return { valid: false, error: `Invalid price: ${rawPrice}` };
  }

  const rawTimestamp = data?.timestamp ?? data?.time;
  const timestamp = Number(rawTimestamp);
  
  // We allow timestamp to be missing or invalid but we might want to flag it?
  // The original code didn't return false, just logged.
  // But for strict validation, we should probably ensure it's a number if it's there.
  // Let's assume valid for now but parse it.
  
  return { 
    valid: true, 
    asset: assetKey, 
    price, 
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() 
  };
};
