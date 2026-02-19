/**
 * Time/Timestamp Utilities for QuFLX Dashboard
 * 
 * Consolidated timestamp normalization for consistent handling across:
 * - Chart data (lightweight-charts requires integer seconds)
 * - History data loading
 * - Strategy Lab data
 * - Marker timestamps
 */

/**
 * Normalize timestamp to Unix seconds.
 * Handles both milliseconds and seconds timestamps.
 * 
 * @param {number|string} ts - Timestamp in ms or seconds
 * @returns {number|null} Unix timestamp in seconds, or null if invalid
 */
export const normalizeTimestamp = (ts) => {
  // Handle null/undefined
  if (ts === null || ts === undefined) return null;
  
  // Convert to number if string
  const numeric = typeof ts === 'number' ? ts : Number(ts);
  
  // Validate it's a finite number
  if (!Number.isFinite(numeric)) return null;
  
  // If > year 2286 in seconds (10000000000), it's milliseconds
  // This threshold safely distinguishes ms from seconds
  const seconds = numeric > 10000000000 
    ? Math.floor(numeric / 1000) 
    : Math.floor(numeric);
  
  return Number.isFinite(seconds) ? seconds : null;
};

/**
 * Normalize timestamp for lightweight-charts (requires integer seconds)
 * 
 * @param {number|string} ts - Timestamp
 * @returns {number} Unix timestamp in seconds (0 if invalid)
 */
export const toChartTime = (ts) => {
  const normalized = normalizeTimestamp(ts);
  return normalized || 0;
};

/**
 * Normalize timestamp and return as Date object
 * 
 * @param {number|string} ts - Timestamp
 * @returns {Date|null} Date object or null if invalid
 */
export const toDate = (ts) => {
  const seconds = normalizeTimestamp(ts);
  if (seconds === null) return null;
  return new Date(seconds * 1000);
};

/**
 * Format timestamp for display
 * 
 * @param {number|string} ts - Timestamp
 * @param {string} format - 'short', 'long', or 'iso' (default: 'short')
 * @returns {string} Formatted date string
 */
export const formatTimestamp = (ts, format = 'short') => {
  const date = toDate(ts);
  if (!date) return '';
  
  switch (format) {
    case 'iso':
      return date.toISOString();
    case 'long':
      return date.toLocaleString();
    case 'short':
    default:
      return date.toLocaleTimeString();
  }
};

export default {
  normalizeTimestamp,
  toChartTime,
  toDate,
  formatTimestamp
};