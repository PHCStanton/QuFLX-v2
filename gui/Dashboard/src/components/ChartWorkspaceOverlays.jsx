const ChartWorkspaceOverlays = ({ health, isLoading, selectedAsset }) => {
  return (
    <>
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <span
          className={`backdrop-blur px-2 py-0.5 rounded text-[10px] uppercase font-bold border transition-all duration-500 ${
            health === 'streaming'
              ? 'bg-accent-green/30 text-accent-green border-accent-green shadow-[0_0_20px_rgba(34,197,94,0.8)] animate-pulse'
              : health === 'slow'
              ? 'bg-yellow-500/30 text-yellow-500 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'
              : health === 'stale'
              ? 'bg-orange-500/30 text-orange-500 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]'
              : 'bg-black/60 text-gray-400 border-gray-800 opacity-80'
          }`}
        >
          {health === 'streaming' ? 'Live Feed' : health === 'idle' ? 'Offline' : `${health} Feed`}
        </span>
      </div>

      {isLoading && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-gray-400 border-t-accent-green rounded-full animate-spin"></div>
            <span className="text-gray-300 text-sm">Loading data for {selectedAsset}...</span>
          </div>
        </div>
      )}
    </>
  );
};

export default ChartWorkspaceOverlays;

