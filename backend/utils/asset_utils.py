import re

def normalize_asset(asset: str) -> str:
    """
    Canonical asset normalization - use everywhere for internal keys.
    Removes all non-alphanumeric characters and converts to uppercase.

    Example: 'EUR/USD (OTC)' -> 'EURUSDOTC'
    Example: 'EURUSD_otc'   -> 'EURUSDOTC'

    NOTE: Stock symbols with '#' prefix (e.g. '#AAPL_otc') will have
    the '#' stripped → 'AAPOTC'. This is intentional for internal key
    consistency. The SSID executor's _normalize_asset_symbol() handles
    the '#' prefix separately for PocketOption API calls.
    """
    if not asset:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", str(asset)).upper()

def safe_filename(name: str) -> str:
    """
    Convert a string into a safe filename by replacing non-word characters with underscores.
    """
    if not name:
        return "unknown"
    return re.sub(r"[^\w\-]+", "_", str(name))
