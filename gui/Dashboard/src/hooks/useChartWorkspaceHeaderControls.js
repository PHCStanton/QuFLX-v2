import { useCallback, useMemo, useState } from 'react';

const useChartWorkspaceHeaderControls = ({
  payoutAssets,
  selectedAsset,
  setSelectedTimeframe,
  syncTimeframeUi,
  setError,
}) => {
  const assetOptions = useMemo(() => {
    const assetList = Array.from(new Set([...(payoutAssets || []), selectedAsset].filter(Boolean)));
    return assetList.map((a) => ({ label: a, value: a }));
  }, [payoutAssets, selectedAsset]);

  const handleTimeframeChange = useCallback(
    (val) => {
      setSelectedTimeframe(val).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (setError) setError(`Timeframe change failed: ${msg}`);
      });
    },
    [setSelectedTimeframe, setError]
  );

  const [isSyncingTimeframe, setIsSyncingTimeframe] = useState(false);
  const handleSyncTimeframe = useCallback(async () => {
    if (isSyncingTimeframe) return;
    try {
      setIsSyncingTimeframe(true);
      await syncTimeframeUi();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (setError) setError(`Timeframe UI sync failed: ${msg}`);
    } finally {
      setIsSyncingTimeframe(false);
    }
  }, [isSyncingTimeframe, syncTimeframeUi, setError]);

  return { assetOptions, handleTimeframeChange, isSyncingTimeframe, handleSyncTimeframe };
};

export default useChartWorkspaceHeaderControls;

