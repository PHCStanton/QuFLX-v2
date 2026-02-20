/**
 * Chart Data Utilities for QuFLX Dashboard
 *
 * Provides helper functions for preparing and validating data for lightweight-charts.
 */

import { normalizeTimestamp } from './time';

/**
 * Prepares and deduplicates data for lightweight-charts.
 * 
 * lightweight-charts requires:
 * 1. Data must be sorted by time (ascending).
 * 2. No duplicate timestamps are allowed.
 * 
 * @param {Array} data - Array of data points (e.g., candles or indicator points)
 * @param {Object} options - Configuration options
 * @param {boolean} options.sort - Whether to sort the data (default: true)
 * @param {boolean} options.deduplicate - Whether to remove duplicate timestamps (default: true)
 * @returns {Array} Cleaned data array ready for setData()
 */
export const prepareChartData = (data, options = {}) => {
    if (!Array.isArray(data) || data.length === 0) return [];

    const { sort = true, deduplicate = true } = options;

    let processed = data.map(item => {
        const ts = item.time !== undefined ? item.time : item.timestamp;
        const time = normalizeTimestamp(ts);
        return { ...item, time };
    }).filter(item => item.time !== null);

    if (sort) {
        processed.sort((a, b) => a.time - b.time);
    }

    if (deduplicate) {
        const seen = new Set();
        processed = processed.filter(item => {
            if (seen.has(item.time)) {
                return false; // Skip duplicates
            }
            seen.add(item.time);
            return true;
        });
    }

    return processed;
};

export default {
    prepareChartData
};
