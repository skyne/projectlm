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
    _inherit_socket(catalog, category, part_id)
    CATALOG_PATH.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"registered {category}.{part_id} → {asset_path}")


WHEEL_SOCKET_SOURCE: dict[str, str] = {
    "Hypercar18Standard": "Hypercar18WideRear",
    "Hypercar18LowDrag": "Hypercar18WideRear",
    "GT3WideRear21": "GT3Front20Rear21",
}


def _inherit_socket(catalog: dict, category: str, part_id: str) -> None:
    """Reuse tuned sockets from sibling parts on the same chassis."""
    if category == "wheel_package":
        source_id = WHEEL_SOCKET_SOURCE.get(part_id)
    elif category == "hybrid_system" and part_id != "LMDh50kW":
        source_id = "LMDh50kW"
    else:
        source_id = None
    if not source_id or part_id == source_id:
        return
    bucket = catalog.get(category, {})
    source = bucket.get(source_id)
    target = bucket.get(part_id)
    if not source or not target:
        return
    socket = source.get("socket")
    if socket:
        target["socket"] = json.loads(json.dumps(socket))
        bucket[part_id] = target
