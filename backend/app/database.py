"""
CostGuard Database & SQLite Connection Management
Write-through cache storage for Azure Retail Prices.
"""
import sqlite3
import time
from typing import Optional, Dict, Any, List
from backend.app.config import CACHE_DB_PATH


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or CACHE_DB_PATH
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize SQLite pricing_cache table if not exists."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS pricing_cache (
                sku TEXT NOT NULL,
                region TEXT NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                hourly_rate REAL NOT NULL,
                cached_at INTEGER NOT NULL,
                meter_name TEXT DEFAULT '',
                PRIMARY KEY (sku, region, currency)
            );
            """
        )
        conn.commit()


def get_cached_price(
    sku: str, region: str, currency: str = "USD", db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Look up cached hourly price for (sku, region, currency)."""
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT sku, region, currency, hourly_rate, cached_at, meter_name
            FROM pricing_cache
            WHERE sku = ? AND region = ? AND currency = ?
            """,
            (sku, region, currency.upper()),
        )
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None


def set_cached_price(
    sku: str,
    region: str,
    hourly_rate: float,
    currency: str = "USD",
    meter_name: str = "",
    db_path: Optional[str] = None,
) -> None:
    """Store or update hourly rate in SQLite write-through cache."""
    init_db(db_path)
    cached_at = int(time.time())
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO pricing_cache (sku, region, currency, hourly_rate, cached_at, meter_name)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (sku, region, currency.upper(), float(hourly_rate), cached_at, meter_name),
        )
        conn.commit()


def get_cache_statistics(db_path: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve cache volume, timestamp ranges, and entries."""
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as total_entries FROM pricing_cache")
        total = cursor.fetchone()["total_entries"]

        cursor.execute("SELECT MIN(cached_at) as oldest, MAX(cached_at) as newest FROM pricing_cache")
        row = cursor.fetchone()
        oldest = row["oldest"]
        newest = row["newest"]

        cursor.execute(
            """
            SELECT sku, region, currency, hourly_rate, cached_at, meter_name
            FROM pricing_cache
            ORDER BY cached_at DESC
            LIMIT 100
            """
        )
        rows = [dict(r) for r in cursor.fetchall()]

        return {
            "total_entries": total,
            "oldest_timestamp": oldest,
            "newest_timestamp": newest,
            "entries": rows,
        }


def clear_cache(db_path: Optional[str] = None) -> int:
    """Clear all records from pricing_cache table."""
    init_db(db_path)
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM pricing_cache")
        deleted = cursor.rowcount
        conn.commit()
        return deleted
