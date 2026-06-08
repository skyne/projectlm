# Hypercar mask guide

Each silhouette uses three PNGs in this folder (same pixel size for all three).

## Files

| File | Purpose |
|------|---------|
| `{id}-outline.png` | Black ink strokes on transparent background |
| `{id}-mask.png` | Filled body silhouette — where team colors / stripes are painted |
| `{id}-details.png` | Material zones — wheels, glass, headlights |

Example for your team’s Cadillac pick: `cadillac-v-series-r-mask.png`, `cadillac-v-series-r-details.png`.

## `{id}-mask.png`

- Paint the **body panels** as a solid opaque fill (white `#FFFFFF` or light grey both work).
- Leave the **background transparent** (outside the car).
- Wheels, windows, and headlights can be included in the fill; `-details.png` cuts them out of livery paint.

## `{id}-details.png` color key

Flat, fully opaque RGB on a **transparent** background. Use **one channel per zone** (same as auto-generated masks):

| Channel | Color | Hex | Zone |
|---------|-------|-----|------|
| **Red** | Pure red | `#FF0000` | Wheels (tyres + rims) |
| **Green** | Pure green | `#00FF00` | Cockpit glass (windscreen + side windows) |
| **Blue** | Pure blue | `#0000FF` | Headlight lenses (front) |

Only paint a pixel one color. The renderer checks red first, then green, then blue.

## Hand-editing workflow

1. Open `{id}-outline.png` as a locked guide layer.
2. On a new layer, fill body panels → export as `{id}-mask.png`.
3. On another layer, paint red / green / blue zones → export as `{id}-details.png`.
4. Keep `{id}-outline.png` unchanged unless you want to tweak line art.

**Canvas size must match `{id}-outline.png` exactly** (e.g. Cadillac = 370×135 px). If `-mask.png` or `-details.png` is a different size, zones will look shifted on the car. In GIMP: *Image → Canvas Size* to match the outline, with the outline layer as a locked guide on top.

## After saving

Drop files into `viewer/public/assets/livery/hypercar/` and refresh the browser. No rebuild required.

To regenerate approximate auto masks: `python3 tools/generate_hypercar_details.py`
