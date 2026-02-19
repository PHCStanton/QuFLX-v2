import { useEffect } from 'react';
import { normalizeTimestamp } from '../utils/time';

const useChartMarkers = ({
    mainChart,
    candleSeries,
    aiMessages,
    indicatorSeries,
    activeIndicators,
    selectedAsset,
    selectedTimeframe,
    onError
}) => {
    useEffect(() => {
        if (!mainChart || !candleSeries) return;

        const markers = [];

        // 1. AI Message Markers
        // Assuming aiMessages has { content, ts, role: 'assistant' }
        if (Array.isArray(aiMessages)) {
            aiMessages.forEach(msg => {
                if (msg.role === 'assistant' || msg.role === 'system') {
                    // Primitive parsing for "Buy"/"Sell" keywords in AI text
                    const content = msg.content?.toUpperCase() || '';
                    const isBuy = content.includes('BUY') || content.includes('LONG');
                    const isSell = content.includes('SELL') || content.includes('SHORT');

                    if ((isBuy || isSell) && msg.ts) {
                        const time = normalizeTimestamp(msg.ts);
                        if (!time) return;

                        markers.push({
                            time,
                            position: isBuy ? 'belowBar' : 'aboveBar',
                            color: isBuy ? '#22c55e' : '#ef4444',
                            shape: isBuy ? 'arrowUp' : 'arrowDown',
                            text: 'AI',
                            size: 1 // default is 1
                        });
                    }
                }
            });
        }

        // 2. Supertrend Signals
        // Look for Supertrend in activeIndicators
        const supertrendInd = activeIndicators?.find(ind =>
            (ind.type === 'supertrend' || ind.value === 'supertrend' || ind.key === 'supertrend')
        );

        if (supertrendInd && indicatorSeries && selectedAsset && selectedTimeframe) {
            const key = `${selectedAsset}|${selectedTimeframe}`;
            const seriesForKey = indicatorSeries[key];

            if (seriesForKey) {
                // Try to find direction data
                const directionData = seriesForKey['supertrend_direction'] ||
                    seriesForKey['supertrend_dir'] ||
                    seriesForKey['supertrend_trend'];

                if (Array.isArray(directionData)) {
                    // Sort by time just in case
                    const sortedDir = [...directionData].sort((a, b) => normalizeTimestamp(a.time) - normalizeTimestamp(b.time));

                    let lastDir = null;

                    sortedDir.forEach(pt => {
                        const time = normalizeTimestamp(pt.time);
                        // Value: 1 (Up/Buy), -1 (Down/Sell) OR 'up'/'down'
                        let dir = pt.value;
                        if (typeof dir === 'string') dir = dir.toLowerCase();

                        const isUp = dir === 1 || dir === 'up' || dir === 'buy' || dir === 'long';
                        const isDown = dir === -1 || dir === 'down' || dir === 'sell' || dir === 'short';

                        if (lastDir !== null) {
                            if (lastDir === 'down' && isUp) {
                                // Buy Signal
                                markers.push({
                                    time,
                                    position: 'belowBar',
                                    color: '#22c55e',
                                    shape: 'arrowUp',
                                    text: 'ST',
                                    size: 2
                                });
                            } else if (lastDir === 'up' && isDown) {
                                // Sell Signal
                                markers.push({
                                    time,
                                    position: 'aboveBar',
                                    color: '#ef4444',
                                    shape: 'arrowDown',
                                    text: 'ST',
                                    size: 2
                                });
                            }
                        }

                        if (isUp) lastDir = 'up';
                        else if (isDown) lastDir = 'down';
                    });
                }
            }
        }

        // 3. EMA Cross (Simple Example) - Future expansion

        // Deduplicate markers: LWC crashes if multiple markers at same time? 
        // LWC supports multiple markers, but logic might need sorting.
        markers.sort((a, b) => normalizeTimestamp(a.time) - normalizeTimestamp(b.time));

        try {
            if (candleSeries && typeof candleSeries.setMarkers === 'function') {
                candleSeries.setMarkers(markers);
            }
        } catch (err) {
            console.warn("Failed to set chart markers", err);
            // Suppress trivial errors - if setMarkers fails, just log it, don't crash UI with onError
            console.error(`Marker Error: ${err.message}`);
        }

    }, [mainChart, candleSeries, aiMessages, indicatorSeries, activeIndicators, selectedAsset, selectedTimeframe, onError]);
};

export default useChartMarkers;
