import { useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import useMarketStore from '../store/marketStore';
import { useStreamHealth } from '../hooks/useStreamHealth';
import DataSourceControls from './DataSourceControls';
import AssetFilterGroup from './AssetFilterGroup';
import AssetListView from './AssetListView';
import { normalizeSpecificAsset, parseSpecificAssets } from '../utils/assetUtils';

const AssetPayoutPanel = ({
    showControls = true,
    initialTopHeight = 220,
    onUseForTrade = null, // Integration prop
    className = ""
}) => {
    const {
        payoutAssets,
        selectedAsset,
        setSelectedAsset,
        selectedAssetLoading,
        removePayoutAsset,
        refreshAssets,
        autoRefresh,
        toggleAutoRefresh,
        panelMode,
        setPanelMode,
        quotesByAssetKey,
        tickerMaxAssets,
        backendStatus,
        collectHistory,
        assetFilterState,
        setAssetFilterState,
        // Alerts Integration
        autoRunAlertMonitor,
        toggleAutoRunAlertMonitor,
        alertsStatus,
        startAlerts,
        stopAlerts,
        checkAlertsStatus,
        enableTickLogging,
        toggleTickLogging,
        favorites,
        toggleFavorite,
    } = useMarketStore();

    // Poll Alerts Status
    useEffect(() => {
        checkAlertsStatus();
        const interval = setInterval(checkAlertsStatus, 10000);
        return () => clearInterval(interval);
    }, [checkAlertsStatus]);

    const streamHealth = useStreamHealth();

    const [assetSearchQuery, setAssetSearchQuery] = useState('');
    const maxAssetsToStar = assetFilterState?.maxAssets ?? 5;
    const minPayout = assetFilterState?.minPayout ?? 92;
    const includeAssets = assetFilterState?.includeAssets ?? '';
    const ignoreAssets = assetFilterState?.ignoreAssets ?? '';
    const otcOnly = assetFilterState?.filterMode === 'otc';

    const [topHeight, setTopHeight] = useState(initialTopHeight);

    const containerRef = useRef(null);
    const resizeHandleRef = useRef(null);
    const hasUserResizedRef = useRef(false);
    const dragStartYRef = useRef(0);
    const dragStartHeightRef = useRef(0);

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const minPanelHeight = 140;
        const bottomMinHeight = 140;
        const gapTotalPx = 16;
        const fallbackHandleHeightPx = 8;

        const applyHalfSplit = () => {
            if (hasUserResizedRef.current) return;

            const containerHeight = container.getBoundingClientRect().height;
            if (!Number.isFinite(containerHeight) || containerHeight <= 0) return;

            const handleHeight =
                resizeHandleRef.current?.getBoundingClientRect().height ??
                fallbackHandleHeightPx;

            const availableHeight = containerHeight - handleHeight - gapTotalPx;
            const maxTopHeight = Math.max(minPanelHeight, availableHeight - bottomMinHeight);
            const nextTopHeight = Math.max(
                minPanelHeight,
                Math.min(maxTopHeight, Math.round(availableHeight / 2))
            );

            setTopHeight(nextTopHeight);
        };

        applyHalfSplit();

        const observer = new ResizeObserver(() => {
            applyHalfSplit();
        });

        observer.observe(container);

        return () => {
            observer.disconnect();
        };
    }, []);

    const handleResizeStart = (event) => {
        hasUserResizedRef.current = true;
        dragStartYRef.current = event.clientY;
        dragStartHeightRef.current = topHeight;

        const minHeight = 140;
        const bottomMinHeight = 140;
        const gapTotalPx = 16;
        const fallbackHandleHeightPx = 8;
        const containerHeight = containerRef.current?.getBoundingClientRect().height;
        const handleHeight =
            resizeHandleRef.current?.getBoundingClientRect().height ?? fallbackHandleHeightPx;
        const availableHeight =
            typeof containerHeight === 'number'
                ? containerHeight - handleHeight - gapTotalPx
                : null;
        const maxHeight =
            typeof availableHeight === 'number'
                ? Math.max(minHeight, availableHeight - bottomMinHeight)
                : 600;

        const onMouseMove = (e) => {
            const delta = e.clientY - dragStartYRef.current;
            let next = dragStartHeightRef.current + delta;
            if (next < minHeight) next = minHeight;
            if (next > maxHeight) next = maxHeight;
            setTopHeight(next);
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const rawTickerAssets = (payoutAssets || []).slice(0, tickerMaxAssets);
    const tickerAssets = Array.from(new Set([selectedAsset, ...rawTickerAssets].filter(Boolean))).slice(0, tickerMaxAssets);

    const backendReady = Boolean(backendStatus && backendStatus.readyForAssets);

    const includeAssetSet = useMemo(() => new Set(parseSpecificAssets(includeAssets)), [includeAssets]);
    const ignoreAssetSet = useMemo(() => new Set(parseSpecificAssets(ignoreAssets)), [ignoreAssets]);

    const setIncludeAssets = (value) => {
        setAssetFilterState({
            ...(assetFilterState || {}),
            includeAssets: typeof value === 'string' ? value : ''
        });
    };

    const setIgnoreAssets = (value) => {
        setAssetFilterState({
            ...(assetFilterState || {}),
            ignoreAssets: typeof value === 'string' ? value : ''
        });
    };

    const addToIncludeAssets = (asset) => {
        const normalized = normalizeSpecificAsset(asset);
        if (!normalized) return;
        const currentIgnore = parseSpecificAssets(ignoreAssets).filter((a) => a !== normalized);
        setIgnoreAssets(currentIgnore.join(', '));
        const currentInclude = parseSpecificAssets(includeAssets);
        if (!currentInclude.includes(normalized)) {
            setIncludeAssets([...currentInclude, normalized].join(', '));
        }
    };

    const addToIgnoreAssets = (asset) => {
        const normalized = normalizeSpecificAsset(asset);
        if (!normalized) return;
        const currentInclude = parseSpecificAssets(includeAssets).filter((a) => a !== normalized);
        setIncludeAssets(currentInclude.join(', '));
        const currentIgnore = parseSpecificAssets(ignoreAssets);
        if (!currentIgnore.includes(normalized)) {
            setIgnoreAssets([...currentIgnore, normalized].join(', '));
        }
    };

    const removeFromIncludeAssets = (asset) => {
        const normalized = normalizeSpecificAsset(asset);
        if (!normalized) return;
        const current = parseSpecificAssets(includeAssets).filter((a) => a !== normalized);
        setIncludeAssets(current.join(', '));
    };

    const removeFromIgnoreAssets = (asset) => {
        const normalized = normalizeSpecificAsset(asset);
        if (!normalized) return;
        const current = parseSpecificAssets(ignoreAssets).filter((a) => a !== normalized);
        setIgnoreAssets(current.join(', '));
    };

    const isAssetIncluded = (asset) => includeAssetSet.has(normalizeSpecificAsset(asset));
    const isAssetIgnored = (asset) => ignoreAssetSet.has(normalizeSpecificAsset(asset));

    const handleGetAssets = () => {
        const parsedInclude = parseSpecificAssets(includeAssets);
        const parsedIgnore = parseSpecificAssets(ignoreAssets);
        const options = { min_pct: minPayout };
        if (maxAssetsToStar) options.max_assets = maxAssetsToStar;
        if (parsedInclude.length) options.include_assets = parsedInclude;
        if (parsedIgnore.length) options.ignore_assets = parsedIgnore;
        if (otcOnly) options.filter_mode = 'otc';

        setAssetFilterState({
            ...(assetFilterState || {}),
            maxAssets: maxAssetsToStar,
            minPayout,
            includeAssets: parsedInclude.join(', '),
            ignoreAssets: parsedIgnore.join(', '),
            filterMode: otcOnly ? 'otc' : null
        });

        refreshAssets(options);
    };

    return (
        <div ref={containerRef} className={`flex flex-col gap-2 h-full min-h-0 justify-between ${className}`}>
            {showControls && (
                <DataSourceControls
                    height={topHeight}
                    backendReady={backendReady}
                    autoRefresh={autoRefresh}
                    onToggleAutoRefresh={toggleAutoRefresh}
                    otcOnly={otcOnly}
                    onToggleOtcOnly={() =>
                        setAssetFilterState({
                            ...(assetFilterState || {}),
                            filterMode: otcOnly ? null : 'otc'
                        })
                    }
                    onGetAssets={handleGetAssets}
                    onCollectHistory={collectHistory}
                    isBusyRefreshing={autoRefresh}
                    streamHealth={streamHealth}
                    // Alerts Props
                    autoRunAlertMonitor={autoRunAlertMonitor}
                    onToggleAutoRunAlertMonitor={toggleAutoRunAlertMonitor}
                    alertsStatus={alertsStatus}
                    onStartAlerts={() => startAlerts(payoutAssets)}
                    onStopAlerts={stopAlerts}
                    enableTickLogging={enableTickLogging}
                    onToggleTickLogging={toggleTickLogging}
                >
                    <AssetFilterGroup
                        maxAssetsToStar={maxAssetsToStar}
                        onMaxAssetsChange={(val) =>
                            setAssetFilterState({
                                ...(assetFilterState || {}),
                                maxAssets: Math.max(1, Math.min(50, parseInt(val, 10) || 15))
                            })
                        }
                        minPayout={minPayout}
                        onMinPayoutChange={(val) =>
                            setAssetFilterState({
                                ...(assetFilterState || {}),
                                minPayout: Math.max(1, Math.min(100, parseInt(val, 10) || 92))
                            })
                        }
                        includeAssets={includeAssets}
                        onIncludeAssetsChange={setIncludeAssets}
                        includeAssetList={Array.from(includeAssetSet)}
                        onRemoveIncludeAsset={removeFromIncludeAssets}
                        ignoreAssets={ignoreAssets}
                        onIgnoreAssetsChange={setIgnoreAssets}
                        ignoreAssetList={Array.from(ignoreAssetSet)}
                        onRemoveIgnoreAsset={removeFromIgnoreAssets}
                    />
                </DataSourceControls>
            )}

            {showControls && (
                <div
                    ref={resizeHandleRef}
                    onMouseDown={handleResizeStart}
                    className="h-2 cursor-row-resize bg-section-bg/50 hover:bg-accent-green/60 transition-colors rounded flex items-center justify-center border-y border-border-primary shrink-0"
                >
                    <div className="flex gap-1">
                        {[1, 2, 3].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-text-secondary/50" />)}
                    </div>
                </div>
            )}

            <AssetListView
                panelMode={panelMode}
                onTogglePanelMode={() => setPanelMode(panelMode === 'list' ? 'ticker' : 'list')}
                minPayout={minPayout}
                payoutAssets={payoutAssets}
                selectedAsset={selectedAsset}
                selectedAssetLoading={selectedAssetLoading}
                onSelectAsset={setSelectedAsset}
                onRemoveAsset={removePayoutAsset}
                onAddToInclude={addToIncludeAssets}
                onAddToIgnore={addToIgnoreAssets}
                onRemoveFromInclude={removeFromIncludeAssets}
                onRemoveFromIgnore={removeFromIgnoreAssets}
                isAssetIncluded={isAssetIncluded}
                isAssetIgnored={isAssetIgnored}
                quotesByAssetKey={quotesByAssetKey}
                tickerAssets={tickerAssets}
                assetSearchQuery={assetSearchQuery}
                onSearchQueryChange={setAssetSearchQuery}
                onUseForTrade={onUseForTrade}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
            />
        </div>
    );
};

export default AssetPayoutPanel;
