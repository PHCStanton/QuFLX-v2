import { useEffect, useRef } from 'react';

const useChartPriceLines = ({
    candleSeries,
    aiMessages,
    activeIndicators
}) => {
    const linesRef = useRef([]);

    useEffect(() => {
        if (!candleSeries) return;

        // Clear existing lines
        linesRef.current.forEach(line => {
            try {
                candleSeries.removePriceLine(line);
            } catch (e) {
                console.warn(e);
            }
        });
        linesRef.current = [];

        const newLines = [];

        // 1. AI Message Levels (Simple Extraction)
        // Look for: "Entry: 1.2345", "Target: 1.2345", "Stop: 1.2345"
        if (Array.isArray(aiMessages)) {
            const latestMsg = aiMessages
                .filter(m => m.role === 'assistant' || m.role === 'system')
                .slice(-3); // Only verify last 3 messages to avoid clutter

            latestMsg.forEach(msg => {
                const text = msg.content || '';

                // Regex for common levels
                // Capture Label and Price
                const patterns = [
                    { regex: /(?:Entry|Buy|Sell)\s*(?:@|at|:)?\s*(\d+\.\d{2,})/i, color: '#facc15', title: 'Entry' },
                    { regex: /(?:Target|TP|Take Profit)\s*(?:@|at|:)?\s*(\d+\.\d{2,})/i, color: '#22c55e', title: 'Target' },
                    { regex: /(?:Stop|SL|Stop Loss)\s*(?:@|at|:)?\s*(\d+\.\d{2,})/i, color: '#ef4444', title: 'Stop' }
                ];

                patterns.forEach(({ regex, color, title }) => {
                    const match = text.match(regex);
                    if (match && match[1]) {
                        const price = parseFloat(match[1]);
                        if (!isNaN(price)) {
                            newLines.push({
                                price,
                                color,
                                title: `${title}: ${price}`,
                                lineWidth: 1,
                                lineStyle: 2 // Dashed
                            });
                        }
                    }
                });
            });
        }

        // 2. Explicit Price Lines from Active Indicators (Theoretical)
        if (activeIndicators) {
            activeIndicators.forEach(ind => {
                if (ind.type === 'price_line' && ind.params?.price) {
                    newLines.push({
                        price: ind.params.price,
                        color: ind.options?.color || '#38bdf8',
                        title: ind.name || 'Level',
                        lineWidth: 1,
                        lineStyle: 0 // Solid
                    });
                }
            });
        }

        // Render Lines
        newLines.forEach(opts => {
            try {
                const line = candleSeries.createPriceLine(opts);
                linesRef.current.push(line);
            } catch (e) {
                console.warn("Failed to create price line", e);
            }
        });

        // Cleanup function for when deps change
        return () => {
            linesRef.current.forEach(line => {
                try {
                    candleSeries.removePriceLine(line);
                } catch (err) {
                    console.warn('Failed to remove price line', err);
                }
            });
            linesRef.current = [];
        };

    }, [candleSeries, aiMessages, activeIndicators]);
};

export default useChartPriceLines;
