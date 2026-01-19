import { useMemo, useState, useRef, useLayoutEffect } from 'react';
import useMarketStore from '../store/marketStore';
import { useStreamHealth } from '../hooks/useStreamHealth';
import DataSourceControls from './DataSourceControls';
import AssetFilterGroup from './AssetFilterGroup';
import AssetListView from './AssetListView';

const normalizeSpecificAsset = (asset) => {
  if (!asset) return '';
  return String(asset).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};

const parseSpecificAssets = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return [];

  let parts = [];
  if (/[\n,;]+/.test(raw)) {
    parts = raw.split(/[\n,;]+/);
  } else if (raw.includes('/')) {
    parts = [raw];
  } else {
    parts = raw.split(/\s+/);
  }

  return Array.from(new Set(parts.map((a) => normalizeSpecificAsset(String(a).trim())).filter(Boolean)));
};

const AssetPanel = () => {
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
    setAssetFilterState,
  } = useMarketStore();

  const streamHealth = useStreamHealth();

  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [maxAssetsToStar, setMaxAssetsToStar] = useState(5);
  const [minPayout, setMinPayout] = useState(92);
  const [specificAssets, setSpecificAssets] = useState('');
  const [specificAssetMode, setSpecificAssetMode] = useState('ignore');
  const [otcOnly, setOtcOnly] = useState(false);
  const [topHeight, setTopHeight] = useState(220);
  const [isTopCollapsed, setIsTopCollapsed] = useState(false);
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(false);
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
      if (isTopCollapsed || isBottomCollapsed) return;

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
  }, [isTopCollapsed, isBottomCollapsed]);

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

  const specificAssetSet = useMemo(() => new Set(parseSpecificAssets(specificAssets)), [specificAssets]);

  const addToSpecificAssets = (asset, mode) => {
    const normalized = normalizeSpecificAsset(asset);
    if (!normalized) {
      return;
    }

    setSpecificAssetMode(mode);
    setSpecificAssets((prev) => {
      const currentAssets = parseSpecificAssets(prev);
      if (!currentAssets.includes(normalized)) {
        return [...currentAssets, normalized].join(', ');
      }
      return currentAssets.join(', ');
    });
  };

  const removeFromSpecificAssets = (asset) => {
    const normalized = normalizeSpecificAsset(asset);
    if (!normalized) {
      return;
    }

    setSpecificAssets((prev) => {
      const currentAssets = parseSpecificAssets(prev).filter((a) => a !== normalized);
      return currentAssets.join(', ');
    });
  };

  const isAssetInFilter = (asset) => specificAssetSet.has(normalizeSpecificAsset(asset));

  const handleGetAssets = () => {
    const parsedTargets = parseSpecificAssets(specificAssets);
    const options = {
      min_pct: minPayout
    };
    if (maxAssetsToStar) {
      options.max_assets = maxAssetsToStar;
    }
    if (parsedTargets.length) {
      options.target_assets = parsedTargets;
      options.target_assets_mode = specificAssetMode;
    }
    if (otcOnly) {
      options.filter_mode = 'otc';
    }

    setAssetFilterState({
      maxAssets: maxAssetsToStar,
      minPayout,
      targetAssets: parsedTargets.join(', '),
      targetAssetsMode: specificAssetMode,
      filterMode: otcOnly ? 'otc' : null
    });

    refreshAssets(options);
  };

  return (
    <div ref={containerRef} className="col-span-3 flex flex-col gap-2 h-full min-h-0 justify-between">

      <DataSourceControls
        height={topHeight}
        isCollapsed={isTopCollapsed}
        onToggleCollapsed={() => setIsTopCollapsed((prev) => !prev)}
        isBottomCollapsed={isBottomCollapsed}
        backendReady={backendReady}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={toggleAutoRefresh}
        otcOnly={otcOnly}
        onToggleOtcOnly={() => setOtcOnly((prev) => !prev)}
        onGetAssets={handleGetAssets}
        onCollectHistory={collectHistory}
        isBusyRefreshing={autoRefresh}
        streamHealth={streamHealth}
      >
        <AssetFilterGroup
          maxAssetsToStar={maxAssetsToStar}
          onMaxAssetsChange={(val) =>
            setMaxAssetsToStar(Math.max(1, Math.min(50, parseInt(val, 10) || 15)))
          }
          minPayout={minPayout}
          onMinPayoutChange={(val) => setMinPayout(Math.max(1, Math.min(100, parseInt(val, 10) || 92)))}
          specificAssets={specificAssets}
          onSpecificAssetsChange={setSpecificAssets}
          specificAssetMode={specificAssetMode}
          onSpecificAssetModeChange={setSpecificAssetMode}
        />
      </DataSourceControls>

      {!isTopCollapsed && !isBottomCollapsed && (
        <div
          ref={resizeHandleRef}
          onMouseDown={handleResizeStart}
          className="h-2 cursor-row-resize bg-section-bg/50 hover:bg-accent-green/60 transition-colors rounded flex items-center justify-center border-y border-border-primary shrink-0"
        >
          <div className="flex gap-1">
            <span className="w-1 h-1 rounded-full bg-text-secondary/50" />
            <span className="w-1 h-1 rounded-full bg-text-secondary/50" />
            <span className="w-1 h-1 rounded-full bg-text-secondary/50" />
          </div>
        </div>
      )}

      <AssetListView
        isCollapsed={isBottomCollapsed}
        onToggleCollapsed={() => setIsBottomCollapsed((prev) => !prev)}
        panelMode={panelMode}
        onTogglePanelMode={() => setPanelMode(panelMode === 'list' ? 'ticker' : 'list')}
        payoutAssets={payoutAssets}
        selectedAsset={selectedAsset}
        selectedAssetLoading={selectedAssetLoading}
        onSelectAsset={setSelectedAsset}
        onRemoveAsset={removePayoutAsset}
        onAddToInclude={(asset) => addToSpecificAssets(asset, 'include')}
        onAddToIgnore={(asset) => addToSpecificAssets(asset, 'ignore')}
        onRemoveFromFilter={removeFromSpecificAssets}
        isAssetInFilter={isAssetInFilter}
        specificAssetMode={specificAssetMode}
        quotesByAssetKey={quotesByAssetKey}
        tickerAssets={tickerAssets}
        assetSearchQuery={assetSearchQuery}
        onSearchQueryChange={setAssetSearchQuery}
      />
    </div>
  );
};

export default AssetPanel;
