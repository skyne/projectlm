# Track editor tutorial

## What the visual editor does today

| In the editor (visual) | Not in the editor yet |
|------------------------|------------------------|
| Centerline / layout (drag points) | Runoff, gravel, kerbs |
| Sectors (`start_t` / `end_t`) | **Barriers** (`surface_profile`) |
| Pit lane numbers | Width profile painting |
| Save drafts to `tracks/drafts/` | Map labels |

Barriers and runoff are stored in **`surface_profile`** inside the same JSON file. You still **see** them on the map (the editor reuses the race viewer renderer), but you **author** them by editing JSON — usually on a draft you saved from the editor.

---

## How barriers work in `surface_profile`

Each entry is a **band along the lap**, not a separate polyline.

| Field | Meaning |
|-------|---------|
| `start_t`, `end_t` | Normalized lap position, **0.0 = start/finish → 1.0 = back to S/F** |
| `side` | `inboard` (inside of corner), `outboard` (outside), or `both` |
| `surface` | Surface type (see table below) |
| `width_m` | Thickness of the band outward from the track edge (metres) |
| `inner_offset_m` | Optional gap **beyond the asphalt edge** before this band starts (used to stack gravel → barrier) |
| `grip_multiplier` | Sim grip on that surface (`0.0` for barriers) |
| `width_start_m` / `width_end_m` + `envelope` | Optional taper (`flat`, `flare_entry`, `flare_exit`, `bell`) |

### Barrier surface types

| `surface` value | Typical use |
|-----------------|-------------|
| `barrier_armco` | Metal guardrail |
| `barrier_tecpro` | TecPro blocks |
| `barrier_wall` | Concrete wall |

Related bands you often place **before** the barrier (closer to the track):

| `surface` | Role |
|-----------|------|
| `runoff_concrete` / `runoff_asphalt` | Paved escape area |
| `gravel` | Gravel trap |
| `kerb_sausage` / `kerb_positive` / `kerb_negative` | Kerbs |
| `verge` | Grass strip (often auto-synthesized on bare straights) |

**Stacking example:** asphalt edge → 10 m gravel (`inner_offset_m: 0`) → armco 1 m thick at `inner_offset_m: 12` (12 m from asphalt = outer edge of gravel).

The sim also **synthesizes** a default grass verge + outer barrier on stretches where you did not author anything. Do not copy segments whose `name` starts with `synth:perimeter-` into drafts — the exporter strips those on save.

---

## Workflow: layout in editor, barriers in JSON

### 1. Start the editor

```bash
./tools/track-editor/dev.sh
# → http://localhost:5190
```

### 2. Load or create a layout

- Pick a catalog track, or open an existing draft.
- Edit the centerline (Select / Add point tools).
- Adjust **sectors** in the sidebar — sector `start_t` / `end_t` are the best guide for where corners are on the lap.
- **Save** (`Ctrl+S`) to `tracks/drafts/my_circuit.json`.

### 3. Open the draft JSON

Edit `tracks/drafts/my_circuit.json` in your editor of choice.

If you need precise `t` for a corner, use the sector rows you set in step 2. Example: sector `"T1"` with `start_t: 0.095` and `end_t: 0.12` → place runoff/barrier roughly in that band.

### 4. Add a barrier block

Minimal outboard armco on one corner:

```json
{
  "name": "T1 outer armco",
  "start_t": 0.095,
  "end_t": 0.12,
  "side": "outboard",
  "surface": "barrier_armco",
  "width_m": 1.0,
  "grip_multiplier": 0.0
}
```

Full corner with runoff + gravel + barrier (pattern from `tracks/sample_circuit.json`):

```json
{
  "name": "Arena outer barrier",
  "start_t": 0.63,
  "end_t": 0.8,
  "side": "outboard",
  "surface": "barrier_armco",
  "inner_offset_m": 12,
  "width_m": 1.0,
  "grip_multiplier": 0.0
}
```

Append objects to the `surface_profile` array (keep valid JSON commas). Ensure `surface_defaults` exists if you use templates:

```json
"surface_defaults": {
  "verge_width_m": 2.0,
  "runoff_width_m": 11.0,
  "kerb_width_m": 0.5
}
```

### 5. Reload in the track editor

- **Drafts** dropdown → pick `my_circuit.json` → **Open draft**.
- Barriers should appear on the map (red/wall styling on outboard bands).
- Tweak `start_t` / `end_t` / `inner_offset_m` in JSON, reload, repeat.

### 6. Test in the sim (optional)

Point a race config at your draft:

```text
track_config=tracks/drafts/my_circuit.json
```

Run a private test or session and drive off-line — barrier zones affect grip and boundary detection.

---

## Worked example: add armco at “Esses” on a draft

Assume you saved a draft and sector **Esses 1** spans `start_t: 0.11` → `end_t: 0.147`.

1. Open the draft JSON.
2. Add gravel (optional) and barrier:

```json
{
  "name": "Esses gravel",
  "start_t": 0.11,
  "end_t": 0.15,
  "side": "outboard",
  "surface": "gravel",
  "width_m": 8.0,
  "grip_multiplier": 0.45
},
{
  "name": "Esses armco",
  "start_t": 0.11,
  "end_t": 0.15,
  "side": "outboard",
  "surface": "barrier_armco",
  "inner_offset_m": 8,
  "width_m": 1.2,
  "grip_multiplier": 0.0
}
```

3. Reload draft in the track editor — gravel shows as tan band, barrier as outer rim.
4. If the barrier floats too far from the track, lower `inner_offset_m`. If it overlaps the asphalt, increase it.

---

## Bulk authoring official circuits

For WEC tracks, corner bands are maintained in Python, not by hand:

```bash
python3 tools/author_surface_profiles.py
```

That rewrites `surface_profile` + `surface_metadata` on catalog tracks from researched templates. COTA has a separate script: `tools/author_cota_surface_gridlife.py`.

Use the visual editor for **new layouts**; use scripts or JSON edits for **surface/barrier** on existing circuits.

---

## Tips

- **Use sectors as a ruler** — define sectors in the visual editor first, then copy their `t` ranges into `surface_profile`.
- **Small `t` tweaks** — `0.01` on a 5 km lap ≈ 50 m; on Le Mans (~13.6 km) ≈ 136 m.
- **Both sides** — `"side": "both"` mirrors the band inboard and outboard (common for kerbs).
- **Do not edit synthesized segments** — names like `synth:perimeter-grass-outboard` are generated at load time.
- **Undo in the editor** does not cover JSON file edits — use git or duplicate drafts before big `surface_profile` changes.

---

## Coming later (phase 2)

Planned visual tools: paint runoff/gravel/barrier bands on the map, drag `t` handles on corner markers, and export back into `surface_profile` without hand-editing JSON.
