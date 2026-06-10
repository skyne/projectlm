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
