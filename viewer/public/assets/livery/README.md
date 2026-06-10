# Class livery silhouettes

Garage and livery previews tint the **compositor side-profile assembly** (grey chassis art + bolt-on aero + wheels from `configs/visual_catalog.json`):

| Class    | Source |
|----------|--------|
| Hypercar | Chassis + front/rear aero + wheels via compositor; chassis picked from `teamName` when no build is passed |
| LMP2     | Oreca07 assembly |
| LMGT3    | GT3 assembly + optional `assets/livery/lmgt3-body.svg` body mask |

Team primary/secondary colors and stripe patterns are applied in `viewer/src/graphics/liveryRenderer.ts`.

Rear wing vs wingless follows the car's `rear_aero_type` part (e.g. `WinglessGroundEffect`).
