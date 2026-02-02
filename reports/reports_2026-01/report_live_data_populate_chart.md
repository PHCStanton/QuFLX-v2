# Report: Live Data and Chart Population Workflow
**Date**: 2026-01-05
**Status**: Implementation Verified

## **Overview**
This report details the end-to-end workflow of how the system captures Pocket Option (PO) historical and live market data, processes it through the backend, and populates the frontend charts. The system ensures that historical data is loaded *before* live streaming begins to provide a seamless charting experience.

---

## **1. Backend Operations**

### **A. Data Collection (Collector Service)**
The Collector Service is responsible for intercepting WebSocket traffic from a Chrome instance running Pocket Option.

- **File**: [interceptor.py](file:///c:/QuFLX/v2/backend/services/collector/interceptor.py)
  - **Purpose**: Intercepts WebSocket frames via Chrome Performance Logs and parses them into `Tick` or `History` objects.
  - **Key Snippet**: The `_refresh_logs` method buffers data to prevent "log stealing" between history and tick fetchers.
    ```python
    def _refresh_logs(self):
        logs = self.driver.get_log('performance')
        for entry in logs:
            # ... parsing logic ...
            if 'history' in event_data or 'candles' in event_data:
                self._history_buffer.append(event_data)
            else:
                tick = self._parse_tick(parsed_data)
                if tick: self._tick_buffer.append(tick)
    ```

- **File**: [main.py](file:///c:/QuFLX/v2/backend/services/collector/main.py)
  - **Purpose**: Orchestrates the collection loop and publishes ticks to Redis for real-time distribution.
  - **Key Snippet**: The main loop fetches ticks and processes history events separately.
    ```python
    ticks = self.interceptor.fetch_ticks()
    for tick in ticks:
        self.publisher.publish(self.channel, tick)
    self._process_history_events() # Persists history payloads to CSV
    ```

### **B. History Persistence and Retrieval**
- **File**: [history_utils.py](file:///c:/QuFLX/v2/backend/utils/history_utils.py)
  - **Purpose**: Manages saving history to CSV and finding the most recent file for a given asset/timeframe.
  - **Key Snippet**: `get_recent_history_file` supports both legacy and unified timestamped filenames.

- **File**: [history.py](file:///c:/QuFLX/v2/backend/services/gateway/routes/history.py)
  - **Purpose**: Provides API endpoints for the frontend to fetch historical candles.
  - **Key Snippet**: The `get_history` endpoint uses the utility function to serve the latest CSV data.

---

## **2. Frontend Operations**

### **A. State Management (Market Store)**
- **File**: [marketStore.js](file:///c:/QuFLX/v2/gui/Dashboard/src/store/marketStore.js)
  - **Purpose**: Manages selected asset state, history loading, and Socket.IO subscriptions.
  - **Key Snippet**: The `setSelectedAsset` function strictly enforces loading history before initiating live streams.
    ```javascript
    setSelectedAsset: async (asset) => {
        // 1. Sync UI (Browser interaction)
        await get().syncAssetUi();
        // 2. Load History (Fetch from Backend)
        await get().loadHistory(asset);
        // 3. Start Live Stream (Socket.IO)
        get().syncSubscriptions(nextAssetKey);
    }
    ```

### **B. Chart Integration**
- **File**: [ChartWorkspace.jsx](file:///c:/QuFLX/v2/gui/Dashboard/src/components/ChartWorkspace.jsx)
  - **Purpose**: The main container for the chart, utilizing the `useTickAggregation` hook.

- **File**: [useTickAggregation.js](file:///c:/QuFLX/v2/gui/Dashboard/src/hooks/useTickAggregation.js)
  - **Purpose**: Aggregates historical candles and incoming live ticks into the chart series.
  - **Key Snippets**:
    - **History Loading**: Sets the initial bulk data.
      ```javascript
      useEffect(() => {
          if (candles.length > 0) {
              candleSeries.setData(mapped);
          }
      }, [historyCandles, historyStatus]);
      ```
    - **Tick Aggregation**: Updates the latest candle or creates a new one based on timeframe.
      ```javascript
      useEffect(() => {
          const latestTick = seriesTicks[seriesTicks.length - 1];
          // ... calculate candle bucket ...
          candleSeries.update(currentCandle);
      }, [marketData]);
      ```

---

## **Summary of Key Files**

| Layer | File | Role |
| :--- | :--- | :--- |
| **Backend** | [interceptor.py](file:///c:/QuFLX/v2/backend/services/collector/interceptor.py) | WebSocket payload extraction |
| **Backend** | [main.py](file:///c:/QuFLX/v2/backend/services/collector/main.py) | Redis publishing & History processing |
| **Backend** | [history_utils.py](file:///c:/QuFLX/v2/backend/utils/history_utils.py) | CSV persistence & Unified file lookup |
| **Frontend** | [marketStore.js](file:///c:/QuFLX/v2/gui/Dashboard/src/store/marketStore.js) | Sequential History -> Streaming logic |
| **Frontend** | [useTickAggregation.js](file:///c:/QuFLX/v2/gui/Dashboard/src/hooks/useTickAggregation.js) | Real-time candle construction |
