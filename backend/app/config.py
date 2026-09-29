"""
CostGuard Configuration Module
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CACHE_DB_PATH = os.environ.get("COSTGUARD_CACHE_DB", str(BASE_DIR / "pricing_cache.db"))
AZURE_PRICES_API_URL = os.environ.get(
    "AZURE_PRICES_API_URL", "https://prices.azure.com/api/retail/prices"
)
DEFAULT_CURRENCY = os.environ.get("COSTGUARD_DEFAULT_CURRENCY", "INR")
HOURS_PER_MONTH = 730.0
DEFAULT_MAX_INCREASE = float(os.environ.get("COSTGUARD_MAX_INCREASE", "4000.0"))
API_TIMEOUT_SECONDS = float(os.environ.get("COSTGUARD_API_TIMEOUT", "10.0"))
USD_TO_INR_RATE = 83.5


def format_inr(val: float, precision: int = 0, show_sign: bool = False) -> str:
    """Format number in Indian numbering system (e.g. 1,250, 12,500, 1,25,000)."""
    is_neg = val < 0
    val_abs = abs(val)
    if precision > 0:
        base_int = int(val_abs)
        dec = f"{val_abs - base_int:.{precision}f}"[1:]
    else:
        base_int = int(round(val_abs))
        dec = ""
    s = str(base_int)
    if len(s) > 3:
        last3 = s[-3:]
        remaining = s[:-3]
        groups = []
        while len(remaining) > 2:
            groups.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        if remaining:
            groups.insert(0, remaining)
        formatted = ",".join(groups) + "," + last3 + dec
    else:
        formatted = s + dec

    if is_neg:
        return f"-₹{formatted}"
    elif show_sign and val > 0:
        return f"+₹{formatted}"
    else:
        return f"₹{formatted}"

