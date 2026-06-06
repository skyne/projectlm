"""Register normalized assets into configs/visual_catalog.json."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "configs" / "visual_catalog.json"


def register_asset(
    *,
    category: str,
    part_id: str,
    asset_path: str,
    width: int,
    height: int,
    extra: dict | None = None,
) -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    bucket = catalog.setdefault(category, {})
    entry: dict = {
        "layer": asset_path,
        "width": width,
        "height": height,
    }
    if extra:
        entry.update(extra)
    bucket[part_id] = entry
    CATALOG_PATH.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"registered {category}.{part_id} → {asset_path}")
