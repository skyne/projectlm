# Motorsport Manager → 3D prototype extractor

One-command pipeline to rip car meshes from **Motorsport Manager** (Steam) and build a merged `.glb` for quick 3D idea testing. Output stays under `tmp/mm-assets/` by default (not committed).

## Prerequisites

- **Motorsport Manager** installed via Steam (PC, app 415200)
- Optional: subscribe to a [Workshop car mod](https://steamcommunity.com/workshop/browse/?appid=415200&requiredtags%5B%5D=Cars) for better-looking bodies
- `python3`, `blender` (4.x) on PATH

## Run

Default install path on this machine:

`/mnt/data/Games/steamapps/common/Motorsport Manager`

From repo root (after Steam finishes downloading):

```bash
tools/mm-extract/run.sh
```

Wait for download, then extract automatically:

```bash
tools/mm-extract/run.sh --wait
```

Custom install path:

```bash
tools/mm-extract/run.sh --game-dir "/path/to/Motorsport Manager"
```

Only a specific Workshop mod folder:

```bash
tools/mm-extract/run.sh --workshop-id 2807960123
```

Export every mesh (no name filter):

```bash
tools/mm-extract/run.sh --all-meshes
```

Extract OBJs only (skip Blender merge):

```bash
tools/mm-extract/run.sh --extract-only
```

## Output

| Path | Contents |
|------|----------|
| `tmp/mm-assets/raw/meshes/` | Exported `.obj` parts |
| `tmp/mm-assets/raw/textures/` | PNG textures |
| `tmp/mm-assets/manifest.json` | Scored inventory |
| `tmp/mm-assets/export/car_formula.glb` | Formula / single-seater (SimCar_01) |
| `tmp/mm-assets/export/car_lmp.glb` | LMP / endurance prototype (Car_05) |
| `tmp/mm-assets/export/car_gt.glb` | GT (SimCarGT) |
| `tmp/mm-assets/viewer/` | Three.js preview with Formula / LMP / GT tabs |

Rebuild previews only (after extract):

```bash
tools/mm-extract/build_previews.sh
```

Preview:

```bash
cd tmp/mm-assets/viewer && python3 -m http.server 8765
# http://localhost:8765
```

## How it works

1. **extract_meshes.py** (UnityPy) scans `MM_Data/` and Workshop `content/415200/*/` for Unity assets, exports car-like meshes/textures, writes `manifest.json`.
2. **merge_glb.py** (Blender headless) imports top-scoring OBJ parts, joins, normalizes scale, exports GLB.
3. **viewer/index.html** — minimal orbit camera for sanity check.

## Troubleshooting

- **Game not found** — pass `--game-dir` or install MM on Steam.
- **Few / no meshes** — subscribe to a Workshop car mod, re-run; or use `--all-meshes`.
- **Broken livery textures** — expected; prototype uses a flat material. Re-texture in Blender later.
- **Weird merged blob** — lower `--max-parts` in `merge_glb.py` or hand-pick OBJs from `raw/meshes/`.
