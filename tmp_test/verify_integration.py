"""Integration verification script for Redis Streaming Gateway."""
import sys
import ast
import pathlib

sys.path.insert(0, 'c:/QuFLX/v2/ssid/web_app/backend/src')

errors = []

# 1. Package imports
try:
    from quflx_redis_streaming import (
        RedisClient, RedisConfig, RedisPubSubListener,
        SocketIOBridge, SocketIOConfig, StatusProbe,
    )
    print("OK  quflx_redis_streaming package imports")
except ImportError as e:
    errors.append(f"FAIL  quflx_redis_streaming import: {e}")
    print(errors[-1])

# 2. contextlib fix
try:
    import inspect
    import quflx_redis_streaming.pubsub_listener as pl
    src = inspect.getsource(pl)
    assert "import contextlib" in src
    print("OK  contextlib import present in pubsub_listener.py")
except AssertionError:
    errors.append("FAIL  contextlib import MISSING from pubsub_listener.py")
    print(errors[-1])

# 3. Backoff logic
try:
    assert "_RETRY_DELAYS" in src
    assert "_run_with_backoff" in src
    print("OK  exponential backoff present in pubsub_listener.py")
except AssertionError:
    errors.append("FAIL  backoff logic MISSING from pubsub_listener.py")
    print(errors[-1])

# 4. Analysis engine imports
try:
    from oteo_indicator import OTEO
    from manipulation_detector import ManipulationDetector
    print("OK  OTEO and ManipulationDetector imports")
except ImportError as e:
    errors.append(f"FAIL  analysis engine import: {e}")
    print(errors[-1])

# 5. Functional test
try:
    oteo = OTEO(history_window=60)
    det = ManipulationDetector()
    result = oteo.update_tick(123.45)
    print(f"OK  OTEO.update_tick() -> {result!r}")
    det_result = det.update(1234567890.0, 123.45)
    print(f"OK  ManipulationDetector.update() -> {det_result!r}")
except Exception as e:
    errors.append(f"FAIL  engine functional test: {e}")
    print(errors[-1])

# 6. redis_gateway.py syntax
try:
    gw = pathlib.Path("c:/QuFLX/v2/ssid/web_app/backend/data_streaming/redis_gateway.py")
    ast.parse(gw.read_text(encoding="utf-8"))
    print("OK  redis_gateway.py syntax valid")
except SyntaxError as e:
    errors.append(f"FAIL  redis_gateway.py syntax error: {e}")
    print(errors[-1])

# 7. requirements.txt has redis>=5.0
try:
    req = pathlib.Path("c:/QuFLX/v2/ssid/web_app/backend/requirements.txt").read_text()
    assert "redis>=5.0" in req
    print("OK  redis>=5.0 in requirements.txt")
except AssertionError:
    errors.append("FAIL  redis>=5.0 MISSING from requirements.txt")
    print(errors[-1])

# 8. TradingPlatform.jsx uses market_data
try:
    tp = pathlib.Path("c:/QuFLX/v2/ssid/web_app/frontend/src/components/TradingPlatform.jsx").read_text(encoding="utf-8")
    assert "on('market_data'" in tp, "market_data listener missing"
    assert "on('price_update'" not in tp, "price_update listener still present"
    print("OK  TradingPlatform.jsx listens for market_data (not price_update)")
except AssertionError as e:
    errors.append(f"FAIL  TradingPlatform.jsx: {e}")
    print(errors[-1])

# 9. streaming_server.py marked deprecated
try:
    ss = pathlib.Path("c:/QuFLX/v2/ssid/web_app/backend/data_streaming/streaming_server.py").read_text(encoding="utf-8")
    assert "DEPRECATED" in ss
    print("OK  streaming_server.py marked as deprecated")
except AssertionError:
    errors.append("FAIL  DEPRECATED marker MISSING from streaming_server.py")
    print(errors[-1])

# 10. config.js STREAM_URL unchanged
try:
    cfg = pathlib.Path("c:/QuFLX/v2/ssid/web_app/frontend/src/config.js").read_text()
    assert "localhost:3001" in cfg
    print("OK  config.js STREAM_URL points to localhost:3001")
except AssertionError:
    errors.append("FAIL  config.js STREAM_URL not pointing to localhost:3001")
    print(errors[-1])

print()
if errors:
    print(f"RESULT: {len(errors)} check(s) FAILED")
    sys.exit(1)
else:
    print("RESULT: All 10 checks passed. Integration is complete.")
