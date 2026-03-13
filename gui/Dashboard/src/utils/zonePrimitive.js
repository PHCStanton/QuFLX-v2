/**
 * ZonePrimitive — lightweight-charts ISeriesPrimitive
 *
 * Draws a filled, semi-transparent region on the chart using native canvas.
 * Attaches to any series via: series.attachPrimitive(new ZonePrimitive(...))
 * Remove with:               series.detachPrimitive(primitive)
 *
 * fill modes:
 *   'band'  — filled rectangle between upper and lower price levels (default)
 *   'above' — filled from `upper` price up to the TOP of the chart (e.g. red above resistance)
 *   'below' — filled from `lower` price down to the BOTTOM of the chart (e.g. green below support)
 */
export class ZonePrimitive {
    /**
     * @param {object} opts
     * @param {string}  opts.id
     * @param {number}  opts.upper  - Upper price bound (used for 'band' and 'above')
     * @param {number}  opts.lower  - Lower price bound (used for 'band' and 'below')
     * @param {string}  opts.color  - CSS colour string with rgba opacity
     * @param {'buy'|'sell'|'area_above'|'area_below'|'custom'} opts.type
     * @param {'band'|'above'|'below'} opts.fill  - Fill direction (default: 'band')
     */
    constructor({ id, upper, lower, color, type = 'custom', fill = 'band' }) {
        this.id = id;
        this.upper = upper;
        this.lower = lower;
        this.color = color;
        this.type = type;
        this.fill = fill;
        this._series = null; // injected by LWC on attach
    }

    // ── ISeriesPrimitive lifecycle ─────────────────────────────────────────────

    attached(api) {
        // `api.series` gives us access to priceToCoordinate()
        this._series = api.series;
    }

    detached() {
        this._series = null;
    }

    updateAllViews() {
        // Called by LWC when data changes — no internal state to update
    }

    // ── Rendering ──────────────────────────────────────────────────────────────

    paneViews() {
        const self = this;

        return [
            {
                zOrder: () => 'bottom', // draw behind candles

                renderer() {
                    return {
                        draw(target) {
                            if (!self._series) return;

                            target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, verticalPixelRatio }) => {
                                ctx.save();
                                ctx.fillStyle = self.color;

                                if (self.fill === 'above') {
                                    // Red area from resistance level up to the top of the chart
                                    const cssY = self._series.priceToCoordinate(self.upper);
                                    if (cssY === null) { ctx.restore(); return; }
                                    const bitmapY = cssY * verticalPixelRatio;
                                    ctx.fillRect(0, 0, bitmapSize.width, bitmapY);

                                } else if (self.fill === 'below') {
                                    // Green area from support level down to the bottom of the chart
                                    const cssY = self._series.priceToCoordinate(self.lower);
                                    if (cssY === null) { ctx.restore(); return; }
                                    const bitmapY = cssY * verticalPixelRatio;
                                    ctx.fillRect(0, bitmapY, bitmapSize.width, bitmapSize.height - bitmapY);

                                } else {
                                    // 'band' — filled rectangle between upper and lower (default)
                                    const cssY1 = self._series.priceToCoordinate(self.upper);
                                    const cssY2 = self._series.priceToCoordinate(self.lower);
                                    if (cssY1 === null || cssY2 === null) { ctx.restore(); return; }
                                    const bitmapY1 = cssY1 * verticalPixelRatio;
                                    const bitmapY2 = cssY2 * verticalPixelRatio;
                                    const top = Math.min(bitmapY1, bitmapY2);
                                    const height = Math.abs(bitmapY2 - bitmapY1);
                                    ctx.fillRect(0, top, bitmapSize.width, height);
                                }

                                ctx.restore();
                            });
                        },

                        // No background drawing needed
                        drawBackground() { },
                    };
                },
            },
        ];
    }
}
