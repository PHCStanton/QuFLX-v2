# Data Contracts & API Specifications

This document defines the data structures and JSON contracts used in the QuFLX v2 system, specifically between the Backend (Gateway) and the Frontend (Dashboard).

## 1. WebSocket Events (Socket.IO)

### `market_data`
Emitted by Gateway to `market_data:{asset}` room when a new tick or candle is received.

**Payload (Tick Variant)**
Corresponding to `backend.models.market_data.Tick`.
```json
{
  "asset": "AUDNZDOTC",
  "price": 0.98765,
  "timestamp": 1702934400.123,
  "source": "pocketoption"
}
```

**Payload (Candle Variant - if applicable)**
Corresponding to `backend.models.market_data.Candle`.
```json
{
  "asset": "AUDNZDOTC",
  "timestamp": 1702934400,
  "open": 0.98760,
  "high": 0.98770,
  "low": 0.98750,
  "close": 0.98765,
  "volume": 100,
  "timeframe": "1m",
  "is_closed": false
}
```

### `system_status`
Emitted by Gateway when a service status changes.
Corresponding to `backend.models.events.SystemStatus`.

```json
{
  "service": "collector",
  "status": "connected",
  "timestamp": 1702934400.0,
  "details": null
}
```

### `asset_selected`
Emitted by Gateway to confirm an asset selection command succeeded.

```json
{
  "asset": "AUDNZDOTC"
}
```

## 2. HTTP API Endpoints

### `POST /api/v1/bootstrap-history`
Returns recent history from the collector (in-memory/live fetch).

**Request**
```json
{
  "asset": "AUDNZDOTC",
  "timeframe": "1m",
  "duration": 0
}
```

**Response**
```json
{
  "ok": true,
  "asset": "AUDNZDOTC",
  "timeframe": 1,
  "count": 60,
  "candles": [
    {
      "timestamp": 1702934400,
      "open": 0.98760,
      "high": 0.98770,
      "low": 0.98750,
      "close": 0.98765,
      "volume": 100
    }
  ]
}
```

### `GET /api/v1/history/{asset}`
Returns persisted CSV history.

**Response**
```json
{
  "asset": "AUDNZDOTC",
  "timeframe": 1,
  "count": 100,
  "data": [
    {
      "timestamp": 1702934400,
      "asset": "AUDNZDOTC",
      "timeframe": "1m",
      "open": 0.98760,
      "high": 0.98770,
      "low": 0.98750,
      "close": 0.98765,
      "volume": 100
    }
  ]
}
```

### `POST /api/v1/refresh-assets`
Triggers an asset list refresh.

**Response**
```json
{
  "assets": [
    "AUDNZDOTC",
    "EURUSDOTC",
    ...
  ]
}
```

### `GET /api/v1/status`
Returns the global system state.

**Response**
```json
{
  "collector": "connected",
  "stream": "streaming",
  "last_tick_ts": 1702934400.123,
  "last_tick_asset": "AUDNZDOTC"
}
```
