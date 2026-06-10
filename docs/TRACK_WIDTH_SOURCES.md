# Track width template sources

Track corridor width data in `tracks/*.json` supplies default racing-line corridor
width, optional per-segment overrides (`width_profile`), pit-lane geometry hints,
and provenance metadata. Values are **estimated** templates for simulation — not
survey-grade as-built drawings.

All tracks share baseline metadata:

| Field | Value |
|-------|-------|
| `width_metadata.confidence` | `estimated` |
| `width_metadata.last_reviewed` | `2026-06-10` |
| `pit_lane.merge_lateral_offset` | `0.58` (normalized lateral merge point) |
| `pit_lane.merge_blend_m` | `80` m blend along merge arc |
| `pit_lane.width_m` | `12` m (WEC pit-lane minimum template) |

Grid / pit-straight segments use `width_profile` entries with `start_t: 0.0`,
`end_t: 0.12`, and `width_m ≥ 15` unless a tier-2 source specifies a higher
start/finish width.

---

## Per-track summary

| Track file | Default width (m) | Profile overrides (m) | Pit offset (m) | Tier | Primary sources |
|------------|------------------:|-----------------------|---------------:|:----:|-----------------|
| `bahrain.json` | 14 | grid 0.00–0.12 → **22** | 12 | 2 | FIA Appendix O 2025; Bahrain International Circuit FIA Grade 1 inspection data (14 m typical, 22 m start/finish) |
| `paul_ricard.json` | 12 | grid 0.00–0.12 → **14** | 10 | 2 | FIA Appendix O 2025; Circuit Paul Ricard FIA Grade 1 data (12 m typical, 14 m main straight) |
| `lemans_la_sarthe.json` | 13 | grid 0.00–0.12 → **15**; Mulsanne 0.145–0.285 → **15** | 10 | 2 | FIA Appendix O 2025; ACO / Circuit de la Sarthe public-road width band (12–15 m) |
| `cota.json` | 12 | grid 0.00–0.12 → 15 | 10 | 1 | FIA Appendix O 2025 (generic Grade 1 minimum template) |
| `fuji.json` | 12 | grid 0.00–0.12 → 15 | 10 | 1 | FIA Appendix O 2025 |
| `imola.json` | 12 | grid 0.00–0.12 → 15 | 10 | 1 | FIA Appendix O 2025 |
| `losail.json` | 12 | grid 0.00–0.12 → 15 | 10 | 1 | FIA Appendix O 2025 |
| `sao_paulo.json` | 12 | grid 0.00–0.12 → 15 | 10 | 1 | FIA Appendix O 2025 |
| `spa.json` | 12 | grid 0.00–0.12 → 15 | 10 | 1 | FIA Appendix O 2025 |
| `sample_circuit.json` | 12 | grid 0.00–0.12 → 15 | 12 | — | Synthetic test circuit; FIA Appendix O 2025 baseline only |

**Tier legend:** 1 = FIA sporting minimum / generic template only; 2 = circuit-specific
published or inspection width band applied.

---

## Citations

### FIA Appendix O 2025 (all tracks)

Fédération Internationale de l'Automobile, *Appendix O to the International
Sporting Code — Requirements for Circuits*, 2025 edition. Sets minimum circuit
widths for Grade 1 permanent circuits (typically 12 m racing surface, 15 m on
main straight for new Grade 1 designs) and pit-lane requirements for
international series including WEC.

- Reference key in JSON: `fia_appendix_o_2025`
- URL: https://www.fia.com/regulation/category/123

### Bahrain International Circuit (tier 2)

FIA Grade 1 homologation and circuit documentation cite ~14 m minimum track
width with a widened start/finish straight to ~22 m for F1/WEC layouts.

- Reference key: `bahrain_international_circuit_fia_grade_1`
- Public summary: https://www.bahraincircuit.com (circuit facts / FIA Grade 1)

### Circuit Paul Ricard (tier 2)

FIA Grade 1 data for the current 5.842 km layout: ~12 m typical width,
~14 m on the Mistral straight (start/finish / grid section).

- Reference key: `circuit_paul_ricard_fia_grade_1`
- Public summary: https://www.circuitpaulricard.com

### Circuit de la Sarthe / Le Mans (tier 2)

ACO circuit guide and FIA/WEC event documentation: permanent pit straight and
stadium section at Grade 1 widths; public-road portions (e.g. Mulsanne) commonly
quoted at 12–15 m usable width depending on section.

- Reference key: `acd_circuit_de_la_sarthe`
- Public summary: https://www.24h-lemans.com/en/circuit

### Tier-1 circuits (COTA, Fuji, Imola, Losail, São Paulo, Spa)

No circuit-specific width survey was available at template authoring time.
Defaults follow FIA Appendix O Grade 1 minima (12 m, 15 m grid straight) until
tier-2 measurements are added.

---

## JSON field reference

```json
{
  "track_width_m": 12.0,
  "width_profile": [
    {"name": "grid straight", "start_t": 0.0, "end_t": 0.12, "width_m": 15.0}
  ],
  "pit_lane": {
    "width_m": 12.0,
    "offset_m": 10.0,
    "merge_lateral_offset": 0.58,
    "merge_blend_m": 80.0
  },
  "width_metadata": {
    "confidence": "estimated",
    "sources": ["fia_appendix_o_2025"],
    "last_reviewed": "2026-06-10"
  }
}
```

`track.cpp` loads `track_width_m`, `width_profile`, and `pit_lane.offset_m` into
the sim corridor; additional `pit_lane` and `width_metadata` fields are retained
for tooling and future corridor merge logic.

---

## Surface profile sources (`surface_profile`, `surface_metadata`)

Corner-specific runoff, kerb, gravel, and barrier bands live in each track JSON.
Values are **estimated** templates mapped from published safety programmes, FIA
circuit maps, and motorsport press — not as-built CAD. Re-author with
`python3 tools/author_surface_profiles.py` (COTA is maintained separately).

| Track file | Segments | Confidence | Primary surface sources |
|------------|----------:|:----------:|-------------------------|
| `cota.json` | 33 | mapped | GRIDLIFE official safety map (`tracks/reference/cota_gridlife_safety_map.png`); 2024 F1 turf/fake-gravel overlays |
| `spa.json` | 13 | estimated | Spa-Francorchamps 2022 working-progress bulletin; Autosport gravel return |
| `imola.json` | 9 | estimated | Motorsport.com 2024 gravel expansion; Tracing Insights 2025 preview |
| `lemans_la_sarthe.json` | 10 | estimated | FIA WEC / ACO Porsche Curves upgrades; Autosport safety revamp articles |
| `paul_ricard.json` | 5 | estimated | Circuit Paul Ricard Blue Line™ docs; ELMS facts sheet |
| `bahrain.json` | 5 | estimated | FIA Grade 1 + typical Gulf layout gravel at T4/T10 |
| `fuji.json` | 5 | estimated | 2005 Tilke redesign safety (gravel + asphalt runoff) |
| `losail.json` | 6 | estimated | 2025 Qatar GP gravel strips (T6, T10, T14, T16) |
| `sao_paulo.json` | 5 | estimated | RacingCircuits.info 2014 Interlagos refurb |
| `sample_circuit.json` | 4 | synthetic | FIA Appendix O test template |

### Surface citation keys

| Key | Summary | URL |
|-----|---------|-----|
| `spa_francorchamps_workingprogress_2022` | Official 2022 runoff/gravel corner list | https://www.spa-francorchamps.be/en/news/248_workingprogress |
| `autosport_spa_gravel_return_2022` | F1 driver support for Spa gravel programme | https://www.autosport.com/f1/news/f1-drivers-support-return-of-gravel-to-spa-francorchamps-4978145/ |
| `motorsport_imola_gravel_2024` | Imola asphalt→gravel at Piratella, Acque Minerali, Variante Alta | https://www.motorsport.com/f1/news/imola-brings-back-gravel-traps-to-help-drive-away-f1s-track-limits-problem/10611358/ |
| `tracinginsights_imola_2025` | 2025 Emilia-Romagna GP corner guide | https://tracinginsights.com/blog/321894/all-you-need-to-know-2025-emilia-romagna-grand-prix/ |
| `fiawec_lemans_track_upgrades` | Porsche Curves gravel widening + Mulsanne verges | https://www.fiawec.com/en/news/circuit-des-24-heures-track-upgrades/2862 |
| `autosport_porsche_curves_safety` | Porsche Curves phase-2 asphalt runoff | https://www.autosport.com/wec/news/porsche-curves-safety-upgrade-on-le-mans-24-hours-circuit-completed-5322760/ |
| `circuit_paul_ricard_blue_line` | Blue/red abrasive runoff zones | https://signature.circuitpaulricard.com/en/the-circuit/technologies-innovations |
| `qatar_gp_2025_gravel_track_limits` | Losail T6/T10/T14/T16 gravel for 2025 | https://sports.yahoo.com/articles/f1-makes-track-changes-avoid-110000464.html |
| `racingcircuits_interlagos_2014_refurb` | Senna S runoff expansion | https://www.racingcircuits.info/south-america/brazil/interlagos.html |
| `gridlife_cota_driver_resources_safety_map` | Official runoff/gravel/barrier map (20 corners) | https://www.grid.life/cota-drivers-resources-1 |
| `cota_track_limits_2024_motorsport` | COTA turf/fake gravel corners (2024 F1) | (see `cota.json` `surface_metadata`) |
| `fuji_speedway_tilke_2005_redesign` | Grade 1 gravel + asphalt runoff layout | https://en.wikipedia.org/wiki/Fuji_Speedway |
| `fia_appendix_o_2025` | Baseline runoff/barrier standards | https://www.fia.com/regulation/category/123 |
