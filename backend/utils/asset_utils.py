import re

def normalize_asset(asset: str) -> str:
    """
    Canonical asset normalization - use everywhere.
    Removes all non-alphanumeric characters and converts to uppercase.
    
    Example: 'EUR/USD (OTC)' -> 'EURUSDOTC'
    """
    if not asset:
        return ""
    import re
    return re.sub(r"[^A-Za-z0-9]", "", str(asset)).upper()

def normalize_asset_name(asset: str) -> str:
    """Deprecated: Use normalize_asset instead."""
    return normalize_asset(asset)

def safe_filename(name: str) -> str:
    """
    Convert a string into a safe filename by replacing non-word characters with underscores.
    """
    if not name:
        return "unknown"
    return re.sub(r"[^\w\-]+", "_", str(name))
