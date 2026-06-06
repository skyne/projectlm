#!/usr/bin/env python3
"""Batch image generation for ProjectLM visual assets (Gemini or Pollinations)."""

from __future__ import annotations

import argparse
import os
import sys
import time
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

import yaml
from dotenv import load_dotenv
from PIL import Image

from normalize import normalize_image
from register_catalog import register_asset

ROOT = Path(__file__).resolve().parents[2]
STYLE_GUIDE = ROOT / "configs" / "asset_style_guide.txt"
PROMPTS_PATH = Path(__file__).parent / "prompts.yaml"
SCRATCH_DIR = Path(__file__).parent / "output" / "_scratch"
PUBLIC_ASSETS = ROOT / "viewer" / "public" / "assets"

# Free tier: ~10 RPM — stay under with a small delay between calls.
RATE_LIMIT_SEC = 6.5


def load_style() -> str:
    return STYLE_GUIDE.read_text(encoding="utf-8").strip()


def load_jobs(set_name: str) -> list[dict]:
    data = yaml.safe_load(PROMPTS_PATH.read_text(encoding="utf-8"))
    jobs = data.get(set_name, [])
    if not jobs:
        raise SystemExit(f"No jobs in prompts.yaml set '{set_name}'")
    return jobs


def extract_image_bytes_gemini(response) -> bytes:
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.data:
            return part.inline_data.data
    raise RuntimeError("No image in Gemini response")


def generate_gemini(client, model: str, prompt: str, scratch_path: Path) -> Path:
    from google.genai import types

    print(f"  → Gemini ({model})…")
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
    )
    raw = extract_image_bytes_gemini(response)
    scratch_path.parent.mkdir(parents=True, exist_ok=True)
    scratch_path.write_bytes(raw)
    Image.open(BytesIO(raw)).verify()
    return scratch_path


def shorten_prompt(prompt: str, max_len: int = 900) -> str:
    """Pollinations encodes the prompt in the URL — keep it short."""
    compact = " ".join(prompt.split())
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 3] + "..."


def generate_pollinations(
    prompt: str,
    scratch_path: Path,
    *,
    width: int,
    height: int,
) -> Path:
    print("  → Pollinations (flux)…")
    short = shorten_prompt(prompt)
    q = urllib.parse.urlencode(
        {
            "width": width,
            "height": height,
            "model": "flux",
            "nologo": "true",
        }
    )
    url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(short)}?{q}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "ProjectLM-AssetGen/1.0"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read()
    scratch_path.parent.mkdir(parents=True, exist_ok=True)
    scratch_path.write_bytes(raw)
    Image.open(BytesIO(raw)).verify()
    return scratch_path


def generate_one(
    backend: str,
    prompt: str,
    scratch_path: Path,
    *,
    width: int,
    height: int,
    gemini_client=None,
    gemini_model: str = "",
) -> Path:
    if backend == "gemini":
        if gemini_client is None:
            raise RuntimeError("Gemini client not configured")
        return generate_gemini(gemini_client, gemini_model, prompt, scratch_path)
    if backend == "pollinations":
        return generate_pollinations(prompt, scratch_path, width=width, height=height)
    raise ValueError(f"Unknown backend: {backend}")


def asset_rel_path(category: str, part_id: str, digest: str) -> str:
    return f"assets/{category}/{part_id}.{digest}.png"


def run_job(
    backend: str,
    gemini_model: str,
    job: dict,
    style: str,
    *,
    dry_run: bool,
    register: bool,
    gemini_client=None,
) -> None:
    job_id = job["id"]
    category = job["category"]
    part_id = job["part_id"]
    width = int(job.get("width", 1024))
    height = int(job.get("height", 512))
    prompt = job["prompt"].format(style=style)

    print(f"\n[{job_id}] {width}×{height}")
    if dry_run:
        print(prompt[:200] + "…")
        return

    scratch = SCRATCH_DIR / f"{job_id}.raw.png"
    generate_one(
        backend,
        prompt,
        scratch,
        width=width,
        height=height,
        gemini_client=gemini_client,
        gemini_model=gemini_model,
    )

    out_dir = PUBLIC_ASSETS / category
    digest = normalize_image(
        scratch,
        out_dir / f"{part_id}.png",
        width=width,
        height=height,
        remove_near_black_bg=category in {"chassis", "front_aero", "rear_aero", "wheel_package"},
    )
    rel = asset_rel_path(category, part_id, digest)
    print(f"  ✓ {rel}")

    if register:
        extra = {}
        if category == "chassis":
            extra = {"classId": "Hypercar", "anchor": {"x": width // 2, "y": int(height * 0.55)}}
        if category in {"front_aero", "rear_aero"}:
            extra = {"z": 20 if category == "front_aero" else 30}
        register_asset(
            category=category,
            part_id=part_id,
            asset_path=rel,
            width=width,
            height=height,
            extra=extra or None,
        )


def main() -> None:
    load_dotenv(ROOT / ".env")

    parser = argparse.ArgumentParser(description="Generate ProjectLM assets via Gemini")
    parser.add_argument("--set", default="mvp", help="Prompt set in prompts.yaml")
    parser.add_argument(
        "--backend",
        default=os.getenv("IMAGE_GEN_BACKEND", "auto"),
        choices=["auto", "gemini", "pollinations"],
    )
    parser.add_argument("--model", default=os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"))
    parser.add_argument("--dry-run", action="store_true", help="Print prompts only")
    parser.add_argument("--no-register", action="store_true", help="Skip visual_catalog.json update")
    parser.add_argument("--job", help="Run single job id from the set")
    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEY")
    backend = args.backend
    if backend == "auto":
        backend = "gemini" if api_key else "pollinations"
    if backend == "gemini" and not api_key and not args.dry_run:
        print("GEMINI_API_KEY missing — use --backend pollinations or add .env", file=sys.stderr)
        sys.exit(1)

    style = load_style()
    jobs = load_jobs(args.set)
    if args.job:
        jobs = [j for j in jobs if j["id"] == args.job]
        if not jobs:
            raise SystemExit(f"Job '{args.job}' not found in set '{args.set}'")

    gemini_client = None
    if api_key and backend == "gemini":
        from google import genai

        gemini_client = genai.Client(api_key=api_key)

    delay = RATE_LIMIT_SEC if backend == "gemini" else 16.0

    for i, job in enumerate(jobs):
        if args.dry_run:
            run_job(backend, args.model, job, style, dry_run=True, register=False)
            continue
        try:
            run_job(
                backend,
                args.model,
                job,
                style,
                dry_run=False,
                register=not args.no_register,
                gemini_client=gemini_client,
            )
        except Exception as exc:
            if backend == "gemini" and args.backend == "auto":
                print(f"  ! Gemini failed ({exc}) — falling back to Pollinations")
                run_job(
                    "pollinations",
                    args.model,
                    job,
                    style,
                    dry_run=False,
                    register=not args.no_register,
                )
                delay = 16.0
            else:
                raise
        if i < len(jobs) - 1:
            time.sleep(delay)

    print("\nDone.")


if __name__ == "__main__":
    main()
