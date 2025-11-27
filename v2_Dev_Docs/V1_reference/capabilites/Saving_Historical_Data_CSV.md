# Historical Data CSV Saving Mechanism

## Overview

This document explains how the QuFLX trading platform handles collection and saving of historical candle data from WebSocket streams. The system automatically detects chart timeframes and saves data in appropriately named CSV files for different time intervals (1M, 5M, 15M, 1H, etc.).

## Core Process Flow

### 1. WebSocket Real-Time Streaming
- **Source**: PocketOption WebSocket data streams
- **Data Type**: OHLC (Open, High, Low, Close) candle data with volume
- **Format**: Real-time tick data converted to candle format
- **Update Frequency**: Ticks arrive continuously, candles form based on timeframe

### 2. Timeframe Detection (Key Innovation)
Instead of relying on potentially unreliable WebSocket timeframe metadata, the system **analyzes the actual candle data** to determine timeframes:

```python
def _detect_timeframe_from_candles(self, candles: List[List]) -> int:
    if len(candles) < 2:
        return 1  # Default fallback

    # Extract timestamp differences between candles
    timestamp_diffs = []
    for i in range(1, min(len(candles), 10)):
        diff_seconds = candles[i][0] - candles[i-1][0]
        if diff_seconds > 0:
            timestamp_diffs.append(diff_seconds)

    # Calculate average interval
    avg_diff_seconds = sum(timestamp_diffs) / len(timestamp_diffs)
    avg_diff_minutes = round(avg_diff_seconds / 60)

    # Map to standard timeframe
    standard_timeframes = [1, 2, 3, 5, 10, 15, 30, 60, 240, 1440]
    detected_timeframe = min(standard_timeframes,
                           key=lambda x: abs(x - avg_diff_minutes))

    return detected_timeframe
```

**Why This Works:**
- H1 candles = ~60-minute intervals → detects 60m
- 15M candles = ~15-minute intervals → detects 15m
- 5M candles = ~5-minute intervals → detects 5m
- Highly reliable regardless of WebSocket metadata consistency

### 3. CSV File Generation

#### File Naming Convention
```
{asset}_{timeframe_suffix}_{YYYY_MM_DD_HH_MM_SS}.csv
```

**Examples:**
- `EURRUB_otc_otc_60m_2025_10_01_18_26_09.csv` (H1 timeframe)
- `EURRUB_otc_otc_15m_2025_10_01_18_26_15.csv` (15M timeframe)
- `EURRUB_otc_otc_5m_2025_10_01_18_26_20.csv` (5M timeframe)
- `EURRUB_otc_otc_1m_2025_10_01_18_26_25.csv` (1M timeframe)

#### Directory Structure
```
data/data_output/assets_data/data_collect/
├── 1M_candles/          # 1-minute candles
│   └── *_1m_*.csv
├── 5M_candles/          # 5-minute candles
│   └── *_5m_*.csv
├── 15M_candles/         # 15-minute candles
│   └── *_15m_*.csv
├── 1H_candles/          # 1-hour candles
│   └── *_60m_*.csv
├── 4H_candles/          # 4-hour candles
│   └── *_240m_*.csv
└── 1D_candles/          # Daily candles
    └── *_1440m_*.csv
```

#### CSV Format
```csv
timestamp,open,close,high,low
2025-09-28 19:22:00,85.21265,85.2121,85.21274,85.21248
2025-09-28 19:23:00,85.2121,85.2122,85.21235,85.21208
```

**Field Descriptions:**
- **timestamp**: ISO format timestamp (converted to readable format)
- **open**: Candle open price
- **close**: Candle close price
- **high**: Highest price in candle period
- **low**: Lowest price in candle period

## Saving Methods

### Primary Method: `save_to_data_collect_csv()`
- **Purpose**: Saves collected candle data with intelligent timeframe detection
- **Trigger**: Called automatically when historical data is received from WebSocket
- **Features**:
  - Automatic timeframe detection from candle timestamps
  - Directory creation based on detected timeframe
  - Comprehensive file naming with asset, timeframe, and timestamp
  - Silent operation except for progress logging

### Secondary Method: `save_to_csv()`
- **Purpose**: Basic CSV saving with manual timeframe specification
- **Trigger**: Manual calls or testing
- **Features**:
  - Uses `self.PERIOD` for timeframe calculation
  - Less flexible but faster for known timeframes

## Key Technical Components

### 1. Candle Data Storage
```python
self.CANDLES: Dict[str, List[List[Any]]] = {}
# Structure: asset -> [[timestamp, open, close, high, low], ...]
```

### 2. Timeframe Mapping
```python
timeframe_dir_map = {
    1: "1M_candles", 5: "5M_candles", 15: "15M_candles",
    60: "1H_candles", 240: "4H_candles", 1440: "1D_candles"
}

timeframe_suffix_map = {
    1: "1m", 5: "5m", 15: "15m", 60: "60m", 240: "240m"
}
```

### 3. WebSocket Integration
- **Event Type**: `updateCharts` messages trigger data collection
- **Data Flow**: WebSocket payload → JSON parsing → candle formation → CSV saving
- **Error Handling**: Graceful fallback to 1M timeframe if detection fails

## Workflow Examples

### Example 1: User Selecting H1 Timeframe
```
1. User selects H1 (1-hour) timeframe in browser
2. WebSocket sends tick data every second
3. System forms 60-minute candles automatically
4. Candle timestamps show ~3600-second intervals
5. _detect_timeframe_from_candles() identifies 60m
6. File saved as: EURRUB_otc_otc_60m_2025_10_01_18_26_09.csv
7. Directory: data/data_output/assets_data/data_collect/1H_candles/
```

### Example 2: Automated Collection Across Timeframes
```
Terminal Output:
📊 Starting OHLC candle streaming mode...
💾 Saved 114 candles for EURRUB_otc to C:\QuFLX\data\data_output\assets_data\data_collect\1H_candles\EURRUB_otc_otc_60m_2025_10_01_18_26_09.csv
📈 Loaded 114 historical candles for EURRUB_otc

[User switches to 15M timeframe]
💾 Saved 113 candles for EURRUB_otc to C:\QuFLX\data\data_output\assets_data\data_collect\15M_candles\EURRUB_otc_otc_15m_2025_10_01_18_26_15.csv
📈 Loaded 113 historical candles for EURRUB_otc
```

## Configuration & Customization

### Runtime Parameters
- **enable_csv_saving**: Boolean flag to enable/disable automatic saving
- **PERIOD**: Base period for candle formation (seconds)
- **CANDLE_ONLY_MODE**: Save only OHLC data, no tick processing

### Directory Management
- **Automatic Creation**: Target directories created automatically
- **Backup Option**: Original files preserved during conversions
- **Cleanup**: Old files can be archived or removed as needed

## Integration Points

### 1. With Browser Interaction
- **Timeframe Detection**: Works seamlessly with chart timeframe selection
- **Session Sync**: Maintains correlation between browser view and saved data
- **Asset Tracking**: Automatically detects current asset from browser context

### 2. With Data Processing Pipeline
- **Timestamp Conversion**: CSV files ready for timezone conversion (UTC+2 → UTC+0)
- **Anomaly Detection**: Candle data can be analyzed for irregularities
- **Signal Generation**: OHLC data feeds technical analysis systems

### 3. With Storage & Analytics
- **Database Import**: Structured CSV format easily imported into databases
- **Historical Analysis**: Time-series data for backtesting and research
- **Performance Monitoring**: Track strategy performance across timeframes

## Error Handling & Reliability

### Detection Fallbacks
1. **Insufficient Data**: Returns 1-minute default if < 2 candles
2. **Invalid Intervals**: Filters out non-positive timestamp differences
3. **Edge Cases**: Maps unusual intervals to nearest standard timeframe

### File System Safety
- **Directory Creation**: Automatic creation with error handling
- **File Conflicts**: Timestamp-based naming prevents overwrites
- **Permissions**: Graceful handling of file system access issues

### Data Integrity
- **Validation**: Ensures OHLC values are within expected ranges
- **Completeness**: Tracks and reports any conversion failures
- **Recovery**: System continues operation even if individual saves fail

## Performance Considerations

### Efficiency Features
- **Minimal Processing**: Light-weight timestamp analysis
- **Lazy Saving**: Saves only when data is available
- **Streaming Output**: Minimal terminal logging during active collection

### Resource Management
- **Memory Limits**: Prevents excessive data accumulation
- **Threading**: Non-blocking file I/O operations
- **Cleanup**: Automatic removal of old temporary data

## Testing & Validation

### Manual Testing Commands
```bash
# Run streaming with automatic saving
python capabilities/data_streaming_csv_save.py --stream

# Test timeframe detection logic
python -c "
from capabilities.data_streaming_csv_save import RealtimeDataStreaming
ds = RealtimeDataStreaming()
# Test with sample candle data
test_candles = [[0, 1.0, 1.0, 1.0, 1.0], [300, 1.1, 1.1, 1.1, 1.1]]
tf = ds._detect_timeframe_from_candles(test_candles)
print(f'Detected timeframe: {tf} minutes')
"
```

### Verification Steps
1. **Check File Creation**: Verify files appear in correct directories
2. **Validate Format**: Ensure CSV header matches expected format
3. **Test Timestamps**: Confirm timestamps are in readable ISO format
4. **Verify Timeframes**: Check that candle intervals match detected timeframe

## Future Enhancements

### Potential Improvements
- **Advanced Detection**: ML-based timeframe pattern recognition
- **Compression**: Automatic gzip compression for large files
- **Cloud Storage**: Direct upload to cloud storage services
- **Real-time Sync**: Live synchronization with trading databases

### Integration Opportunities
- **Market Replay**: Recorded data for strategy backtesting
- **Live Analytics**: Real-time performance dashboards
- **Alert Systems**: Automated alerts based on data patterns

## Troubleshooting Guide

### Common Issues

#### Files Not Being Created
**Symptoms:** No CSV files appear despite streaming
**Causes:**
- WebSocket connection issues
- Insufficient data collection
- Directory permission problems
**Solutions:**
- Check WebSocket connectivity
- Verify data directory permissions
- Enable verbose logging

#### Wrong Timeframe Detection
**Symptoms:** Files saved in unexpected timeframe directories
**Causes:**
- Insufficient candle data for reliable detection
- Clock synchronization issues
- Browser time/local time discrepancies
**Solutions:**
- Ensure adequate candle collection before saving
- Synchronize system clock
- Check browser timezone settings

#### CSV Format Errors
**Symptoms:** CSV files with incorrect formatting
**Causes:**
- Unexpected data types in OHLC values
- Timestamp parsing failures
- Character encoding issues
**Solutions:**
- Validate input data types
- Check for special characters in asset names
- Verify timestamp formats

### Debug Logging
Enable verbose logging to see detailed operations:
```python
ctx = Ctx(verbose=True, debug=True, ...)
```

### File System Diagnostics
Check generated files with:
```bash
find data/data_output/assets_data/data_collect -name "*.csv" | head -10
# Check file contents
head -n 5 data/data_output/assets_data/data_collect/1M_candles/file.csv
```

## Conclusion

This historical data CSV saving mechanism provides a robust, reliable system for collecting and organizing trading data across multiple timeframes. The key innovation of timeframe detection from candle data rather than relying on potentially unreliable WebSocket metadata ensures accurate file organization while maintaining simplicity and performance.

The system seamlessly integrates with browser interactions, automatically adapting to user-selected timeframes while maintaining data integrity and providing comprehensive error handling. This foundation supports advanced features like signal generation, strategy backtesting, and performance analytics.
