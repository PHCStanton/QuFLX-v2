# Indicator Parameters – Dashboard Oscillator Phase

## Scope

This document lists the core parameters that should be exposed in the Dashboard indicator settings modal for the first oscillator phase. It is aligned with the existing V1 reference definitions in `v2_Dev_Docs/V1_reference/UI/indicatorDefinitions.js` and focuses on:

- RSI
- MACD Histogram
- CCI
- DeMarker

All parameters here are intended for backend-driven indicators where the series is computed server side and visualised in dedicated oscillator panes.

## RSI (Relative Strength Index)

- Indicator key: `rsi_14`
- Modal fields:
  - Period
    - Name: `period`
    - Type: number
    - Default: `14`
    - Range: `2`–`50`

Badge label convention: show the period only, for example `14`.

## MACD Histogram

- Indicator key: `macd_histogram`
- Modal fields:
  - Fast Period
    - Name: `fast`
    - Type: number
    - Default: `12`
    - Range: `1`–`100`
  - Slow Period
    - Name: `slow`
    - Type: number
    - Default: `26`
    - Range: `1`–`200`
  - Signal Period
    - Name: `signal`
    - Type: number
    - Default: `9`
    - Range: `1`–`50`

Badge label convention: `fast,slow,signal`, for example `12,26,9`.

## CCI (Commodity Channel Index)

- Indicator key: `cci`
- Modal fields:
  - Period
    - Name: `period`
    - Type: number
    - Default: `20`
    - Range: `5`–`50`

Badge label convention: show the period only, for example `20`.

## DeMarker

- Indicator key: `demarker`
- Modal fields:
  - Period
    - Name: `period`
    - Type: number
    - Default: `10`
    - Range: `2`–`50`

Badge label convention: show the period only, for example `10`.

## Timeframe and History Locking

For all of the indicators above:

- Indicators are requested from the backend with the currently selected timeframe.
- Series are stored in the frontend keyed by `asset|timeframe` to avoid mixing data across timeframes.
- Loading indicators should only proceed when historical data for the selected asset has been successfully loaded.

This ensures that the oscillator values in the panes match both the logical timeframe and the historical candle set used by the strategy and backend pipelines.

