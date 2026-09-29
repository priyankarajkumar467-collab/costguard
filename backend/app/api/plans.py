"""
CostGuard Plans API
Loads built-in test plans and handles uploaded plan validation.
"""
from typing import Dict, Any, List
from pathlib import Path

TEST_PLANS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "test-plans"


def list_sample_plans() -> List[Dict[str, str]]:
    plans = []
    if TEST_PLANS_DIR.exists():
        for p in sorted(TEST_PLANS_DIR.glob("*.json")):
            plans.append({
                "filename": p.name,
                "path": str(p),
                "name": p.stem.replace("_", " ").title(),
            })
    return plans


def read_sample_plan(filename: str) -> str:
    path = TEST_PLANS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Plan {filename} not found.")
    return path.read_text(encoding="utf-8")
