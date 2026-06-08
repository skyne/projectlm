# Hypercar livery silhouettes

Sliced from `sheet.png` (2×4 grid of WEC Hypercar / LMDh side profiles).

Each variant ships as:

- `{id}-outline.png` — ink strokes on transparent background
- `{id}-mask.png` — filled body mask (livery paints **inside** this only)
- `{id}-details.png` — **R** `#FF0000` wheels, **G** `#00FF00` glass, **B** `#0000FF` headlights — see [MASKING_GUIDE.md](./MASKING_GUIDE.md)

Regenerate approximate detail masks: `python3 tools/generate_hypercar_details.py`

| ID | Car |
|----|-----|
| `ferrari-499p` | Ferrari 499P (default) |
| `porsche-963` | Porsche 963 |
| `bmw-m-hybrid-v8` | BMW M Hybrid V8 |
| `cadillac-v-series-r` | Cadillac V-Series.R |
| `lamborghini-sc63` | Lamborghini SC63 |
| `peugeot-9x8` | Peugeot 9X8 |
| `lmh-generic` | Generic LMH outline |

Team HQ / garage pick a stable variant from `teamName` (see `pickHypercarSilhouette` in `liveryRenderer.ts`).
