/**
 * Technical Indicator Definitions
 * Complete catalog of available indicators with parameters and metadata
 */

export const INDICATOR_CATEGORIES = {
  TREND: 'Trend',
  MOMENTUM: 'Momentum',
  VOLATILITY: 'Volatility',
  VOLUME: 'Volume',
  CUSTOM: 'Custom',
};

export const INDICATOR_DEFINITIONS = {
  // Trend Indicators
  sma: {
    id: 'sma',
    name: 'Simple Moving Average (SMA)',
    category: INDICATOR_CATEGORIES.TREND,
    description: 'Average price over a specified period',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 20, min: 1, max: 200 },
    ],
    renderType: 'line',
    color: '#10b981',
  },
  ema: {
    id: 'ema',
    name: 'Exponential Moving Average (EMA)',
    category: INDICATOR_CATEGORIES.TREND,
    description: 'Weighted average giving more weight to recent prices',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 16, min: 1, max: 200 },
    ],
    renderType: 'line',
    color: '#3b82f6',
  },
  wma: {
    id: 'wma',
    name: 'Weighted Moving Average (WMA)',
    category: INDICATOR_CATEGORIES.TREND,
    description: 'Linear weighted average of prices',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 20, min: 1, max: 200 },
    ],
    renderType: 'line',
    color: '#8b5cf6',
  },
  macd: {
    id: 'macd',
    name: 'MACD',
    category: INDICATOR_CATEGORIES.TREND,
    description: 'Moving Average Convergence Divergence',
    parameters: [
      { name: 'fast', label: 'Fast Period', type: 'number', default: 12, min: 1, max: 100 },
      { name: 'slow', label: 'Slow Period', type: 'number', default: 26, min: 1, max: 200 },
      { name: 'signal', label: 'Signal Period', type: 'number', default: 9, min: 1, max: 50 },
    ],
    renderType: 'histogram',
    color: '#10b981',
  },

  // Momentum Indicators
  rsi: {
    id: 'rsi',
    name: 'Relative Strength Index (RSI)',
    category: INDICATOR_CATEGORIES.MOMENTUM,
    description: 'Momentum oscillator measuring overbought/oversold',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 14, min: 2, max: 50 },
    ],
    renderType: 'line',
    color: '#f59e0b',
    levels: [30, 50, 70],
  },
  stochastic: {
    id: 'stochastic',
    name: 'Stochastic Oscillator',
    category: INDICATOR_CATEGORIES.MOMENTUM,
    description: 'Compares closing price to price range',
    parameters: [
      { name: 'k', label: '%K Period', type: 'number', default: 14, min: 1, max: 50 },
      { name: 'd', label: '%D Period', type: 'number', default: 3, min: 1, max: 20 },
    ],
    renderType: 'line',
    color: '#06b6d4',
    levels: [20, 50, 80],
  },
  williams_r: {
    id: 'williams_r',
    name: 'Williams %R',
    category: INDICATOR_CATEGORIES.MOMENTUM,
    description: 'Momentum indicator similar to Stochastic',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 14, min: 2, max: 50 },
    ],
    renderType: 'line',
    color: '#ec4899',
    levels: [-80, -50, -20],
  },
  roc: {
    id: 'roc',
    name: 'Rate of Change (ROC)',
    category: INDICATOR_CATEGORIES.MOMENTUM,
    description: 'Percentage change over a period',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 10, min: 1, max: 50 },
    ],
    renderType: 'line',
    color: '#8b5cf6',
  },
  schaff_tc: {
    id: 'schaff_tc',
    name: 'Schaff Trend Cycle',
    category: INDICATOR_CATEGORIES.MOMENTUM,
    description: 'Combines MACD and Stochastic for trend identification',
    parameters: [
      { name: 'fast', label: 'Fast Period', type: 'number', default: 10, min: 1, max: 50 },
      { name: 'slow', label: 'Slow Period', type: 'number', default: 20, min: 1, max: 100 },
      { name: 'd_macd', label: '%D(MACD)', type: 'number', default: 3, min: 1, max: 20 },
      { name: 'd_pf', label: '%D(PF)', type: 'number', default: 3, min: 1, max: 20 },
    ],
    renderType: 'line',
    color: '#10b981',
    levels: [25, 75],
  },
  demarker: {
    id: 'demarker',
    name: 'DeMarker',
    category: INDICATOR_CATEGORIES.MOMENTUM,
    description: 'Identifies price exhaustion points',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 10, min: 2, max: 50 },
    ],
    renderType: 'line',
    color: '#f59e0b',
    levels: [0.3, 0.7],
  },
  cci: {
    id: 'cci',
    name: 'Commodity Channel Index (CCI)',
    category: INDICATOR_CATEGORIES.MOMENTUM,
    description: 'Measures deviation from average price',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 20, min: 5, max: 50 },
    ],
    renderType: 'line',
    color: '#3b82f6',
    levels: [-100, 0, 100],
  },

  // Volatility Indicators
  bollinger: {
    id: 'bollinger',
    name: 'Bollinger Bands',
    category: INDICATOR_CATEGORIES.VOLATILITY,
    description: 'Volatility bands based on standard deviation',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 20, min: 2, max: 100 },
      { name: 'std_dev', label: 'Std Deviation', type: 'number', default: 2, min: 0.5, max: 5, step: 0.1 },
    ],
    renderType: 'band',
    color: '#6366f1',
  },
  atr: {
    id: 'atr',
    name: 'Average True Range (ATR)',
    category: INDICATOR_CATEGORIES.VOLATILITY,
    description: 'Volatility indicator based on true range',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 14, min: 2, max: 50 },
    ],
    renderType: 'line',
    color: '#f59e0b',
  },

  // Custom Indicators
  supertrend: {
    id: 'supertrend',
    name: 'SuperTrend',
    category: INDICATOR_CATEGORIES.CUSTOM,
    description: 'Trend-following indicator based on ATR',
    parameters: [
      { name: 'period', label: 'Period', type: 'number', default: 10, min: 1, max: 50 },
      { name: 'multiplier', label: 'Multiplier', type: 'number', default: 3.0, min: 0.5, max: 10, step: 0.1 },
    ],
    renderType: 'line',
    color: '#10b981',
  },
};

// Get all indicators by category
export const getIndicatorsByCategory = () => {
  const categorized = {};
  
  Object.values(INDICATOR_CATEGORIES).forEach(category => {
    categorized[category] = [];
  });
  
  Object.values(INDICATOR_DEFINITIONS).forEach(indicator => {
    if (categorized[indicator.category]) {
      categorized[indicator.category].push(indicator);
    }
  });
  
  return categorized;
};

// Get indicator definition by ID
export const getIndicatorDefinition = (indicatorId) => {
  return INDICATOR_DEFINITIONS[indicatorId] || null;
};

// Create default parameters for an indicator
export const createDefaultParams = (indicatorId) => {
  const definition = getIndicatorDefinition(indicatorId);
  if (!definition) return {};
  
  const params = {};
  definition.parameters.forEach(param => {
    params[param.name] = param.default;
  });
  return params;
};
