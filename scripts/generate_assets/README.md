# Asset generation (Gemini)

Offline batch generator for ProjectLM 2D visuals.

## Setup

```bash
cd scripts/generate_assets
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../../.env.example ../../.env   # add GEMINI_API_KEY
```

## Generate assembly layers (composable car)

Each part is a **full 21:9 overlay** aligned to the bare `LMDhDallara` chassis — stack layers to build a car.

```bash
python generate.py --set assembly
python compose_preview.py   # writes output/assembly_preview.png
```

## Generate MVP set (misc assets)

```bash
python generate.py --set mvp
```

Single asset:

```bash
python generate.py --set mvp --job chassis.LMDhDallara
```

Dry-run prompts:

```bash
python generate.py --set mvp --dry-run
```

Outputs land in `viewer/public/assets/{category}/` and register into `configs/visual_catalog.json`.

## Backends

| Backend | Flag | Notes |
|---------|------|-------|
| Gemini | `--backend gemini` | Needs `GEMINI_API_KEY`; image models may require billing if free quota is 0 |
| Pollinations | `--backend pollinations` | No key; rate-limited, may return 402 on anonymous access |
| Auto (default) | `--backend auto` | Tries Gemini, falls back to Pollinations |

## Troubleshooting

**Gemini `429 RESOURCE_EXHAUSTED` with `limit: 0`:** Your GCP project has no free image quota. Enable billing at [Google AI Studio](https://aistudio.google.com) or use a standard API key (`AIza…`).

**Pollinations `402` / `403`:** Use Gemini with billing, or run local FLUX via stable-diffusion.cpp (add a `local` backend later).
